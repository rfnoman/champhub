import { SignUp } from "@clerk/nextjs";

import { PageContainer } from "@/components/layout/page-container";

export default function SignUpPage() {
  return (
    <PageContainer>
      <div className="flex justify-center py-10">
        <SignUp />
      </div>
    </PageContainer>
  );
}
