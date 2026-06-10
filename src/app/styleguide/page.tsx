import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LeaderboardRow,
  PageHeader,
  PageShell,
  StatCard,
} from '@/components';
import { ControlledInputDemo, ModalDemo, ToastDemo } from './demos';

export const metadata = { title: 'Styleguide — Junior Dev' };

/* Dev page: renders every design-system primitive in every state.
   This is the M1 acceptance surface and the visual regression anchor. */

const swatches = [
  ['bg', 'bg-bg border border-edge'],
  ['surface', 'bg-surface'],
  ['raised', 'bg-raised'],
  ['edge', 'bg-edge'],
  ['fg', 'bg-fg'],
  ['fg-muted', 'bg-fg-muted'],
  ['volt', 'bg-volt'],
  ['volt-bright', 'bg-volt-bright'],
  ['info', 'bg-info'],
  ['gold', 'bg-gold'],
  ['elo', 'bg-elo'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['danger', 'bg-danger'],
] as const;

export default function StyleguidePage() {
  return (
    <AppShell
      items={[
        { label: 'Pools', href: '/pools' },
        { label: 'Battles', href: '/battles' },
        { label: 'Leaderboard', href: '/leaderboard' },
        { label: 'Styleguide', href: '/styleguide' },
      ]}
      currentPath="/styleguide"
      right={<Badge variant="volt">LVL 12 · 4,380 XP</Badge>}
    >
      <PageShell>
        <PageHeader
          title="Design System"
          description="Every primitive in every state. Dev-only page — the M1 acceptance surface."
          actions={<Badge variant="outline">v1 tokens</Badge>}
        />

        <Section title="Color tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {swatches.map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className={`h-14 rounded-md ${cls}`} />
                <span className="font-mono text-xs text-fg-muted">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="flex flex-col gap-4">
            <p className="font-display text-5xl tracking-wide">
              FIRST BLOOD <span className="text-volt text-glow">+250 XP</span>
            </p>
            <p className="font-display text-3xl tracking-wide">Russo One — display / headings</p>
            <p className="text-base">
              Chakra Petch — body text. Build a real project against the spec, push to a fresh repo,
              and ship a 30-second demo before the window closes.
            </p>
            <p className="text-sm text-fg-muted">Body small / muted — secondary copy.</p>
            <p className="font-mono text-sm">
              JetBrains Mono — code, timers, stats: <span className="text-volt">14/14 passed</span>{' '}
              · 02:41.07 · 1483 Elo
            </p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-col gap-4">
            {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <span className="w-24 font-mono text-xs text-fg-subtle">{variant}</span>
                <Button variant={variant} size="sm">
                  Join pool
                </Button>
                <Button variant={variant} size="md">
                  Join pool
                </Button>
                <Button variant={variant} size="lg">
                  Join pool
                </Button>
                <Button variant={variant} loading>
                  Judging
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-3">
            <Badge>Neutral</Badge>
            <Badge variant="volt">Live</Badge>
            <Badge variant="gold">1st place</Badge>
            <Badge variant="elo">1483 Elo</Badge>
            <Badge variant="info">Frontend</Badge>
            <Badge variant="danger">Flagged</Badge>
            <Badge variant="outline">Draft</Badge>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
            <Field label="Display name" hint="Shown on leaderboards and battle rooms.">
              {(props) => <Input {...props} placeholder="e.g. sampo" />}
            </Field>
            <Field label="GitHub repo" error="Repo was created before the pool window opened.">
              {(props) => <Input {...props} defaultValue="github.com/sampo/old-project" />}
            </Field>
            <Field label="Disabled">
              {(props) => <Input {...props} disabled value="locked during judging" readOnly />}
            </Field>
            <ControlledInputDemo />
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Realtime Dashboard Sprint</CardTitle>
                <CardDescription>
                  Build a live metrics dashboard with websockets. 7-day window.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Badge variant="info">Frontend</Badge>
                <Badge>Intermediate</Badge>
                <Badge variant="outline">12 / 30 entrants</Badge>
              </CardContent>
              <CardFooter>
                <Button size="sm">Join — 1 credit</Button>
                <span className="ml-auto font-mono text-xs text-fg-subtle">closes in 2d 14h</span>
              </CardFooter>
            </Card>
            <Card accent>
              <CardHeader>
                <CardTitle className="text-volt">Battle challenge</CardTitle>
                <CardDescription>
                  k.osei (1512 Elo) challenges you. Single problem, 20-minute cap.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Badge variant="elo">±24 Elo</Badge>
                <Badge variant="volt">Tier 2</Badge>
              </CardContent>
              <CardFooter>
                <Button size="sm">Accept</Button>
                <Button size="sm" variant="ghost">
                  Decline
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section title="Stats & leaderboard">
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard label="Battle Elo" value="1,483" sub="+24 last match" accent />
            <StatCard label="Global rank" value="#17" sub="of 412 Sussex devs" />
            <StatCard label="Win streak" value="5" sub="personal best: 7" />
          </div>
          <Card className="overflow-hidden">
            <LeaderboardRow
              rank={1}
              name="Amara Diallo"
              role="Backend"
              value="9,120"
              valueLabel="XP"
              delta={2}
            />
            <LeaderboardRow
              rank={2}
              name="Kofi Osei"
              role="Frontend"
              value="8,845"
              valueLabel="XP"
              delta={-1}
            />
            <LeaderboardRow
              rank={3}
              name="Lena Marsh"
              role="ML"
              value="8,790"
              valueLabel="XP"
              delta={1}
            />
            <LeaderboardRow
              rank={17}
              name="Sampo K"
              role="Frontend"
              value="4,380"
              valueLabel="XP"
              delta={3}
              you
            />
            <LeaderboardRow
              rank={18}
              name="Priya Nair"
              role="Mobile"
              value="4,310"
              valueLabel="XP"
            />
          </Card>
        </Section>

        <Section title="Modal">
          <ModalDemo />
        </Section>

        <Section title="Toasts">
          <ToastDemo />
        </Section>
      </PageShell>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 border-b border-edge-subtle pb-2 font-display text-xl tracking-wide text-fg-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}
