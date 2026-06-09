/**
 * Decorative aurora canvas for the Bento dashboard.
 * Absolutely positioned blurred color blobs + a faint masked grid texture.
 * Render as the FIRST child of a `relative isolate` wrapper; put real content
 * after it with `relative z-10` so it paints on top. Glass cards (backdrop-blur)
 * will blur these blobs behind them.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* color blobs */}
      <div className="absolute -top-32 -left-24 h-[30rem] w-[30rem] rounded-full bg-blue-500/25 blur-[110px]" />
      <div className="absolute -top-16 right-[-6rem] h-[26rem] w-[26rem] rounded-full bg-indigo-500/20 blur-[110px]" />
      <div className="absolute top-[24%] left-1/3 h-[24rem] w-[24rem] rounded-full bg-cyan-400/15 blur-[120px]" />
      <div className="absolute top-[55%] right-[10%] h-[22rem] w-[22rem] rounded-full bg-violet-500/12 blur-[120px]" />
      {/* faint grid texture, faded out toward the bottom */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(100,116,139,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.06) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black, transparent 75%)',
        }}
      />
    </div>
  );
}
