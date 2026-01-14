export function AgentStatus({ stage }: { stage?: string }) {
  if (!stage) return null;

  return (
    <div className="flex items-center gap-3 glass px-4 py-2 w-fit">
      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      <span className="text-sm text-white/70">
        Agent reasoning: <span className="text-white">{stage}</span>
      </span>
    </div>
  );
}
