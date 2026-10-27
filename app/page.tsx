import { Field } from "@/components/Field";
import { Reveal } from "@/components/Reveal";
import { SmoothScroll } from "@/components/SmoothScroll";
import { CopyCa } from "@/components/landing/CopyCa";
import { Headline } from "@/components/landing/Headline";
import { HeroComposer } from "@/components/landing/HeroComposer";
import s from "@/components/landing/landing.module.css";
import { Closing, Footer, Nav, Product, Strategies, Team, Venues, Wallet } from "@/components/landing/Sections";

export default function Home() {
  const ca = process.env.NEXT_PUBLIC_HOODIE_CA?.trim();
  return (
    <>
      <SmoothScroll />
      <Field targetId="composer" />
      <Reveal>
        <div className={s.page}>
          <Nav home />
          <main>
            <section className={s.hero}>
              <div className={s.core}>
                <div className={s.halo} />
                <div data-intro style={{ width: "100%" }}><Headline className={s.h1} /></div>
                <p className={s.lede} data-intro>
                  Tell HOODIEBOT what to watch. Its specialists research Pons launches, wait for your entry and trade inside your rules.
                </p>
                <HeroComposer />
                {ca ? <CopyCa ca={ca} /> : null}
              </div>
            </section>
            <Product />
            <Strategies />
            <Team />
            <Wallet />
            <Venues />
            <Closing />
          </main>
          <Footer />
        </div>
      </Reveal>
    </>
  );
}
