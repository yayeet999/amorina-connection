
export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-2 p-2 max-w-[80px] mr-auto">
      <div className="flex space-x-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-2 h-2 bg-secondary/50 rounded-full animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
