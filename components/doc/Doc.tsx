import type { ReactNode } from "react";

import { Footer, Nav } from "@/components/landing/Sections";
import { Reveal } from "@/components/Reveal";
import { SmoothScroll } from "@/components/SmoothScroll";

import s from "./doc.module.css";

export function Doc({ title, updated, figure, children }: { title: string; updated: string; figure?: ReactNode; children: ReactNode }) {
  return (
    <Reveal>
      <SmoothScroll />
      <Nav />
      <main className={s.wrap}>
        {figure ? <div className={s.figure} data-intro>{figure}</div> : null}
        <h1 className={s.title} data-intro>{title}</h1>
        <p className={s.updated} data-intro>Updated {updated}</p>
        <article className={s.body} data-intro>{children}</article>
      </main>
      <Footer />
    </Reveal>
  );
}
