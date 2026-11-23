export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  )
}
