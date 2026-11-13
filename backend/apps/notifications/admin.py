from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ("kind", "user", "title", "read_at", "emailed_at", "created_at")
    list_filter = ("kind", "read_at")
    search_fields = ("title", "body", "user__email")
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at", "updated_at", "emailed_at")
