import { Button } from '@/components';
import { isGitHubOAuthConfigured } from '@/infra/github';
import { connectGitHubAction } from './connect-github.action';

export function ConnectGitHubButton() {
  const mock = !isGitHubOAuthConfigured();
  return (
    <form action={connectGitHubAction} className="flex flex-col gap-2">
      <Button type="submit" variant="secondary" className="self-start">
        Connect GitHub
      </Button>
      {mock && (
        <p className="text-xs text-fg-subtle">
          Dev mode: links a mock GitHub account — real OAuth arrives with credentials.
        </p>
      )}
    </form>
  );
}
