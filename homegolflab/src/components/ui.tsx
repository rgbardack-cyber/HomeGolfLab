import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Crown, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-card rounded-2xl border border-border p-5 ${className}`}>{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'gold' | 'ghost'; full?: boolean };
export function Button({ variant = 'primary', full, className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    outline: 'border border-border bg-card hover:bg-muted',
    gold: 'bg-accent text-accent-foreground hover:opacity-90',
    ghost: 'hover:bg-muted',
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 h-12 font-medium transition active:scale-[0.98] disabled:opacity-50 ${v} ${full ? 'w-full' : ''} ${className}`}
    />
  );
}

export function PageHeader({ icon, title, subtitle, right }: { icon: ReactNode; title: string; subtitle: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-2xl font-bold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; locked?: boolean }[] }) {
  return (
    <div className="grid gap-1 bg-muted rounded-xl p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition ${value === o.value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
        >
          {o.label}
          {o.locked && <Lock className="w-3.5 h-3.5" />}
        </button>
      ))}
    </div>
  );
}

export function PremiumGate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="text-center space-y-3 border-accent/40 bg-accent/5">
      <div className="w-12 h-12 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
        <Crown className="w-6 h-6 text-accent" />
      </div>
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{children}</p>
      <Link to="/perfil" className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-accent text-accent-foreground font-medium">
        Ver Premium
      </Link>
    </Card>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'good' ? 'text-primary' : tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-accent' : 'text-foreground';
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${c}`}>
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export function ScoreRing({ score, size = 104 }: { score: number; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const color = score >= 80 ? 'var(--color-primary)' : score >= 65 ? 'var(--color-accent)' : 'var(--color-destructive)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-bold leading-none">{score}</span>
        <span className="text-[10px] text-muted-foreground">de 100</span>
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const c = tone === 'error' ? 'bg-destructive/10 text-destructive' : tone === 'ok' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground';
  return <div className={`rounded-xl px-3 py-2.5 text-sm ${c}`}>{children}</div>;
}
