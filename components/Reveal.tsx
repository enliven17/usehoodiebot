"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scroll reveals for everything inside: [data-reveal] rises out of a soft blur as it enters, [data-reveal-group]
 * staggers its children, [data-intro] plays once on load (the hero). With reduced motion nothing moves; content is
 * always in the DOM and visible if this script never runs.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const from = { y: 28, opacity: 0, filter: "blur(6px)" };
        // clearProps: a leftover filter or transform would break the glass (backdrop-filter) and sticky children
        const to = { y: 0, opacity: 1, filter: "blur(0px)", duration: 1, ease: "power3.out", clearProps: "filter,transform" };
        gsap.fromTo("[data-intro]", from, { ...to, duration: 1.1, stagger: 0.09, delay: 0.1 });
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.fromTo(el, from, { ...to, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
        });
        gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
          gsap.fromTo(group.children, from, { ...to, stagger: 0.08, scrollTrigger: { trigger: group, start: "top 84%", once: true } });
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  return <div ref={root}>{children}</div>;
}
