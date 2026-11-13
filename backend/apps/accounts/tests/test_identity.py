"""Identity verification: the state machine, the API, and who may see a document.

The last of those is the reason this file is long. Every other upload in the product is
a photograph meant to be looked at; these are scans of people's NIDs, so "can a stranger
fetch it" is not a detail of the feature, it *is* the feature.
"""

from __future__ import annotations

import io

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import (
    IdentityDocumentType,
    IdentityStatus,
    IdentityVerification,
    User,
)
from apps.accounts.services import (
    approve_identity,
    get_or_create_identity,
    is_identity_verified,
    reject_identity,
    revoke_identity,
    save_identity_documents,
    set_account_photo,
    submit_identity,
)
from apps.notifications.models import Notification, NotificationKind

from .factories import PlatformAdminFactory, UserFactory

pytestmark = pytest.mark.django_db


def an_image(name: str = "nid.jpg", *, size: tuple[int, int] = (40, 25)) -> SimpleUploadedFile:
    """A real JPEG. `ImageField` opens it with Pillow, so bytes that merely end in .jpg fail."""
    buffer = io.BytesIO()
    Image.new("RGB", size, (20, 120, 60)).save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def person():
    return UserFactory()


@pytest.fixture
def admin():
    return PlatformAdminFactory()


def a_complete_draft(user) -> IdentityVerification:
    set_account_photo(user=user, photo=an_image("me.jpg"))
    return save_identity_documents(
        user=user,
        data={
            "document_type": IdentityDocumentType.NID,
            "document_number": "1990123456789",
            "document_front": an_image(),
        },
    )


class TestTheStateMachine:
    def test_a_check_starts_as_an_empty_draft(self, person):
        verification = get_or_create_identity(person)

        assert verification.status == IdentityStatus.DRAFT
        assert verification.is_editable
        assert not is_identity_verified(person)

    def test_the_same_account_never_gets_two(self, person):
        assert get_or_create_identity(person).pk == get_or_create_identity(person).pk

    def test_submitting_needs_a_photo_of_the_person(self, person):
        save_identity_documents(
            user=person,
            data={
                "document_type": IdentityDocumentType.PASSPORT,
                "document_number": "BX0912345",
                "document_front": an_image(),
            },
        )

        with pytest.raises(ValidationError) as refusal:
            submit_identity(user=person)

        # A document on its own proves a document exists, not who is holding it.
        assert "photo" in refusal.value.message_dict

    def test_submitting_names_every_missing_piece(self, person):
        set_account_photo(user=person, photo=an_image("me.jpg"))

        with pytest.raises(ValidationError) as refusal:
            submit_identity(user=person)

        assert set(refusal.value.message_dict) == {
            "document_type",
            "document_number",
            "document_front",
        }

    def test_a_complete_draft_submits_and_tells_the_admins(self, person, admin):
        a_complete_draft(person)

        verification = submit_identity(user=person)

        assert verification.status == IdentityStatus.SUBMITTED
        assert verification.submitted_at is not None
        assert not verification.is_editable
        assert verification.events.count() == 1
        assert Notification.objects.filter(
            user=admin, kind=NotificationKind.IDENTITY_SUBMITTED
        ).exists()

    def test_a_submitted_check_is_frozen(self, person):
        a_complete_draft(person)
        submit_identity(user=person)

        with pytest.raises(ValidationError):
            save_identity_documents(user=person, data={"document_number": "9999"})

    def test_approval_verifies_the_account_and_tells_them(self, person, admin):
        a_complete_draft(person)
        verification = submit_identity(user=person)

        approve_identity(verification=verification, reviewer=admin)

        verification.refresh_from_db()
        assert verification.status == IdentityStatus.APPROVED
        assert verification.reviewed_by == admin
        assert is_identity_verified(User.objects.get(pk=person.pk))
        assert Notification.objects.filter(
            user=person, kind=NotificationKind.IDENTITY_APPROVED
        ).exists()

    def test_an_approved_check_cannot_be_edited(self, person, admin):
        a_complete_draft(person)
        approve_identity(verification=submit_identity(user=person), reviewer=admin)

        with pytest.raises(ValidationError):
            save_identity_documents(user=person, data={"document_number": "0000"})

    def test_rejection_requires_a_reason(self, person, admin):
        a_complete_draft(person)
        verification = submit_identity(user=person)

        with pytest.raises(ValidationError) as refusal:
            reject_identity(verification=verification, reviewer=admin, reason="  ")

        assert "reason" in refusal.value.message_dict

    def test_a_rejected_check_can_be_fixed_and_sent_again(self, person, admin):
        a_complete_draft(person)
        verification = submit_identity(user=person)
        reject_identity(verification=verification, reviewer=admin, reason="The back is blurred.")

        verification.refresh_from_db()
        assert verification.status == IdentityStatus.REJECTED
        assert verification.is_editable
        assert Notification.objects.filter(
            user=person, kind=NotificationKind.IDENTITY_REJECTED
        ).exists()

        save_identity_documents(user=person, data={"document_back": an_image("back.jpg")})
        again = submit_identity(user=person)

        assert again.status == IdentityStatus.SUBMITTED
        # The old rejection must not still be on screen next to a pending check.
        assert again.review_note == ""
        assert again.events.count() == 3

    def test_a_verification_can_be_withdrawn_later(self, person, admin):
        a_complete_draft(person)
        approve_identity(verification=submit_identity(user=person), reviewer=admin)
        verification = IdentityVerification.objects.get(user=person)

        revoke_identity(verification=verification, reviewer=admin, reason="Document reported lost.")

        verification.refresh_from_db()
        assert verification.status == IdentityStatus.REJECTED
        assert not is_identity_verified(User.objects.get(pk=person.pk))

    def test_approve_refuses_a_draft(self, person, admin):
        verification = get_or_create_identity(person)

        with pytest.raises(ValidationError):
            approve_identity(verification=verification, reviewer=admin)

    def test_a_document_can_be_cleared(self, person, client):
        """Clearing is `""`, not `NULL` — the column does not accept the latter."""
        a_complete_draft(person)
        client.force_authenticate(person)

        response = client.patch("/api/v1/me/identity", {"document_front": ""}, format="multipart")

        assert response.status_code == 200
        assert response.json()["has_document_front"] is False

    def test_replacing_a_document_removes_the_one_it_replaced(self, person):
        verification = a_complete_draft(person)
        first = verification.document_front.name
        storage = verification.document_front.storage

        save_identity_documents(user=person, data={"document_front": an_image("better.jpg")})

        verification.refresh_from_db()
        assert verification.document_front.name != first
        assert not storage.exists(first)


class TestWhatOthersCanSee:
    def test_the_number_is_masked_on_the_way_out(self, person, client):
        a_complete_draft(person)
        client.force_authenticate(person)

        body = client.get("/api/v1/me/identity").json()

        assert body["document_number"] == "•••• 6789"
        assert "1990123456789" not in str(body)

    def test_the_reviewer_sees_the_number_in_full(self, person, admin, client):
        a_complete_draft(person)
        verification = submit_identity(user=person)
        client.force_authenticate(admin)

        body = client.get(f"/api/v1/admin/identity-verifications/{verification.id}").json()

        # Comparing it against the scan *is* the review.
        assert body["document_number"] == "1990123456789"

    def test_a_stranger_cannot_fetch_somebody_elses_document(self, person, client):
        verification = a_complete_draft(person)
        client.force_authenticate(UserFactory())

        response = client.get(
            f"/api/v1/admin/identity-verifications/{verification.id}/files/document_front"
        )

        assert response.status_code == 403

    def test_a_signed_out_visitor_gets_nothing(self, person, client):
        verification = a_complete_draft(person)

        assert client.get("/api/v1/me/identity").status_code == 401
        assert (
            client.get(
                f"/api/v1/admin/identity-verifications/{verification.id}/files/document_front"
            ).status_code
            == 401
        )

    def test_i_can_fetch_my_own_document(self, person, client):
        a_complete_draft(person)
        client.force_authenticate(person)

        response = client.get("/api/v1/me/identity/files/document_front")

        assert response.status_code == 200
        assert response["Content-Type"] == "image/jpeg"
        assert response["Cache-Control"] == "private, no-store, max-age=0"
        assert b"".join(response.streaming_content)

    def test_asking_for_a_document_that_is_not_there(self, person, client):
        a_complete_draft(person)
        client.force_authenticate(person)

        assert client.get("/api/v1/me/identity/files/document_back").status_code == 404
        # Not a field at all — and certainly not a path into the storage.
        assert client.get("/api/v1/me/identity/files/photo").status_code == 404

    def test_an_admin_can_read_a_submitted_document(self, person, admin, client):
        a_complete_draft(person)
        verification = submit_identity(user=person)
        client.force_authenticate(admin)

        response = client.get(
            f"/api/v1/admin/identity-verifications/{verification.id}/files/document_front"
        )

        assert response.status_code == 200

    def test_documents_are_not_reachable_by_url(self, person):
        """The private store has no base URL, so there is no link to leak."""
        verification = a_complete_draft(person)

        with pytest.raises(ValueError):
            _ = verification.document_front.url


class TestTheApi:
    def test_the_whole_round_trip(self, person, admin, client):
        client.force_authenticate(person)

        photo = client.patch("/api/v1/me", {"photo": an_image("me.jpg")}, format="multipart")
        assert photo.status_code == 200
        assert photo.json()["identity_status"] == "draft"

        saved = client.patch(
            "/api/v1/me/identity",
            {
                "document_type": IdentityDocumentType.DRIVING_LICENCE,
                "document_number": "DK0123456789",
                "document_front": an_image(),
            },
            format="multipart",
        )
        assert saved.status_code == 200
        assert saved.json()["has_document_front"] is True
        assert saved.json()["has_photo"] is True

        submitted = client.post("/api/v1/me/identity/submit")
        assert submitted.status_code == 200
        assert submitted.json()["status"] == "submitted"

        client.force_authenticate(admin)
        queue = client.get("/api/v1/admin/identity-verifications").json()
        assert [row["person"] for row in queue["results"]] == [person.full_name]

        decision = client.post(
            f"/api/v1/admin/identity-verifications/{queue['results'][0]['id']}/approve"
        )
        assert decision.status_code == 200
        assert decision.json()["status"] == "approved"

        # Re-read the account: `force_authenticate` would otherwise hand the view the
        # same in-memory object, whose cached `identity` predates the approval.
        client.force_authenticate(User.objects.get(pk=person.pk))
        assert client.get("/api/v1/me").json()["is_identity_verified"] is True

    def test_an_incomplete_submit_answers_with_the_field_to_fix(self, person, client):
        client.force_authenticate(person)

        response = client.post("/api/v1/me/identity/submit")

        assert response.status_code == 400
        assert "document_front" in response.json()

    def test_the_queue_defaults_to_what_is_waiting(self, person, admin, client):
        a_complete_draft(person)
        submit_identity(user=person)
        other = UserFactory()
        get_or_create_identity(other)
        client.force_authenticate(admin)

        waiting = client.get("/api/v1/admin/identity-verifications").json()
        drafts = client.get("/api/v1/admin/identity-verifications?status=draft").json()

        assert [row["email"] for row in waiting["results"]] == [person.email]
        assert [row["email"] for row in drafts["results"]] == [other.email]

    def test_a_player_cannot_reach_the_queue(self, person, client):
        client.force_authenticate(person)

        assert client.get("/api/v1/admin/identity-verifications").status_code == 403

    def test_rejecting_without_a_reason_is_refused(self, person, admin, client):
        a_complete_draft(person)
        verification = submit_identity(user=person)
        client.force_authenticate(admin)

        response = client.post(
            f"/api/v1/admin/identity-verifications/{verification.id}/reject", {"reason": ""}
        )

        assert response.status_code == 400
