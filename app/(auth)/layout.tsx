import { MessageSquare } from 'lucide-react';

const IS_DEMO = process.env.DEMO_MODE === 'true';

/**
 * Auth layout — wraps /login and /register with a centered card design.
 * Clean minimal layout with the app logo centered above the content.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {IS_DEMO ? 'ManyHands Slack Demo' : 'Slack Clone'}
        </h1>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
