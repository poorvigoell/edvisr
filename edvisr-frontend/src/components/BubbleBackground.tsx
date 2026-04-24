import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  type SpringOptions,
} from "motion/react";

type BubbleColors = {
  first: string;
  second: string;
  third: string;
  fourth: string;
  fifth: string;
};

type BubbleBackgroundProps = {
  children?: ReactNode;
  interactive?: boolean;
  transition?: SpringOptions;
  colors?: BubbleColors;
};

export function BubbleBackground({
  children,
  interactive = true,
  transition = { stiffness: 100, damping: 20 },
  colors = {
    first: "60,35,140",    // deeper purple
    second: "80,50,150",   // muted violet
    third: "30,65,130",    // deep blue
    fourth: "70,35,110",   // dark violet
    fifth: "45,25,110",    // midnight purple
  },
}: BubbleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, transition);
  const springY = useSpring(mouseY, transition);

  const rectRef = useRef<DOMRect | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        rectRef.current = containerRef.current.getBoundingClientRect();
      }
    };
    updateRect();

    const el = containerRef.current;
    const ro = new ResizeObserver(updateRect);
    if (el) ro.observe(el);

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
    };
  }, []);

  useEffect(() => {
    if (!interactive) return;

    const el = containerRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = rectRef.current;
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        mouseX.set(e.clientX - centerX);
        mouseY.set(e.clientY - centerY);
      });
    };

    el.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [interactive, mouseX, mouseY]);

  const bubbleBase: React.CSSProperties = {
    position: "absolute",
    borderRadius: "50%",
    width: "80%",
    height: "80%",
    mixBlendMode: "hard-light",
  };

  const radial = (c: string) =>
    `radial-gradient(circle at center, rgba(${c},0.4) 0%, rgba(${c},0) 50%)`;

  return (
    <div ref={containerRef} className="bubble-bg-wrap">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className="bubble-bg-canvas">
        {/* Bubble 1 — slow vertical bob */}
        <motion.div
          style={{
            ...bubbleBase,
            top: "10%",
            left: "10%",
            background: radial(colors.first),
            willChange: "transform",
          }}
          animate={{ y: [-50, 50, -50] }}
          transition={{ duration: 30, ease: "easeInOut", repeat: Infinity }}
        />

        {/* Bubble 2 — slow rotation from left */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transformOrigin: "calc(50% - 400px)",
            willChange: "transform",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        >
          <div
            style={{
              ...bubbleBase,
              position: "relative",
              background: radial(colors.second),
            }}
          />
        </motion.div>

        {/* Bubble 3 — slow rotation from right */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transformOrigin: "calc(50% + 400px)",
            willChange: "transform",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 40, ease: "linear", repeat: Infinity }}
        >
          <div
            style={{
              ...bubbleBase,
              top: "calc(50% + 200px)",
              left: "calc(50% - 500px)",
              background: radial(colors.third),
            }}
          />
        </motion.div>

        {/* Bubble 4 — horizontal drift */}
        <motion.div
          style={{
            ...bubbleBase,
            top: "10%",
            left: "10%",
            background: radial(colors.fourth),
            opacity: 0.4,
            willChange: "transform",
          }}
          animate={{ x: [-50, 50, -50] }}
          transition={{ duration: 40, ease: "easeInOut", repeat: Infinity }}
        />

        {/* Bubble 5 — large slow orbit */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transformOrigin: "calc(50% - 800px) calc(50% + 200px)",
            willChange: "transform",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        >
          <div
            style={{
              position: "absolute",
              borderRadius: "50%",
              width: "160%",
              height: "160%",
              mixBlendMode: "hard-light",
              background: radial(colors.fifth),
              top: "calc(50% - 80%)",
              left: "calc(50% - 80%)",
            }}
          />
        </motion.div>

        {/* Interactive cursor follower */}
        {interactive && (
          <motion.div
            style={{
              position: "absolute",
              borderRadius: "50%",
              width: "100%",
              height: "100%",
              mixBlendMode: "hard-light",
              background: radial(colors.first),
              opacity: 0.3,
              x: springX,
              y: springY,
              willChange: "transform",
            }}
          />
        )}
      </div>

      <div className="bubble-bg-content">{children}</div>
    </div>
  );
}
