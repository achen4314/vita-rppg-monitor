import { useEffect } from "react";

export function useCinematicMotion() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return undefined;

    let disposed = false;
    let rafId = 0;
    let cleanup: (() => void) | null = null;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis")]).then(
      ([gsapModule, scrollTriggerModule, lenisModule]) => {
        if (disposed) return;

        const gsap = gsapModule.default;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        const Lenis = lenisModule.default;

        gsap.registerPlugin(ScrollTrigger);

        const lenis = new Lenis({
          duration: 1.05,
          smoothWheel: true,
          wheelMultiplier: 0.86,
          touchMultiplier: 0.9,
        });

        lenis.on("scroll", ScrollTrigger.update);

        const raf = (time: number) => {
          lenis.raf(time);
          rafId = requestAnimationFrame(raf);
        };
        rafId = requestAnimationFrame(raf);

        const context = gsap.context(() => {
          gsap.utils.toArray<HTMLElement>("[data-cinematic-scene]").forEach((scene, index) => {
            const content = scene.querySelector<HTMLElement>("[data-scene-content]");
            if (!content) return;
            gsap.fromTo(
              content,
              {
                autoAlpha: index === 0 ? 1 : 0.36,
                y: index === 0 ? 0 : 54,
                scale: index === 0 ? 1 : 0.985,
              },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: scene,
                  start: "top 74%",
                  end: "center center",
                  scrub: 0.7,
                },
              },
            );
          });

          gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((element) => {
            const depth = Number(element.dataset.parallax || "0.12");
            gsap.to(element, {
              yPercent: -depth * 100,
              ease: "none",
              scrollTrigger: {
                trigger: element,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            });
          });
        });

        cleanup = () => {
          context.revert();
          ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
          cancelAnimationFrame(rafId);
          lenis.destroy();
        };
      }
    );

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
}
