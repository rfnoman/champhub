import { SignIn } from "@clerk/nextjs";

import { PageContainer } from "@/components/layout/page-container";

export default function SignInPage() {
  return (
    <PageContainer>
      <div className="flex justify-center py-10">
        <SignIn />
      </div>
    </PageContainer>
  );
}
