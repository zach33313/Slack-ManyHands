import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LoginForm } from './LoginForm';

/**
 * Login page — server component so it can read server-only env vars.
 * Passes googleEnabled to the client LoginForm to conditionally render
 * the Google OAuth button only when AUTH_GOOGLE_ID is configured.
 */
export default function LoginPage() {
  const googleEnabled = !!(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );

  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      }
    >
      <LoginForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}
