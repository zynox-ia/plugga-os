"use client";

import { useEffect, useRef } from "react";

const PROJECT_ID = "pSxbKYCCk7vGhrLFRLrG";

export function UnicornBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let attempts = 0;
    let started = false;
    let cancelled = false;
    let scene: UnicornScene | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const createScene = () => {
      if (cancelled || started) return;

      const element = containerRef.current;
      const addScene = window.UnicornStudio?.addScene;
      if (!element || !addScene) {
        attempts++;
        if (attempts < 10) timeoutId = setTimeout(createScene, 250);
        return;
      }

      started = true;
      void addScene({ projectId: PROJECT_ID, element })
        .then((createdScene) => {
          if (cancelled) createdScene.destroy();
          else scene = createdScene;
        })
        .catch((error: unknown) => console.error("Erro ao inicializar UnicornStudio:", error));
    };

    const loadScript = () => {
      if (window.UnicornStudio?.addScene) {
        createScene();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>('script[src*="unicornstudio.js"]');
      if (!existingScript) {
        window.UnicornStudio = {};
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";
        script.async = true;
        script.onload = createScene;
        (document.head || document.body).appendChild(script);
      } else {
        createScene();
      }
    };

    loadScript();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      scene?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-us-project={PROJECT_ID}
      className="unicorn-bg-container"
    />
  );
}

type UnicornScene = {
  destroy: () => void;
};

declare global {
  interface Window {
    UnicornStudio?: {
      addScene?: (options: { projectId: string; element: Element }) => Promise<UnicornScene>;
      [key: string]: unknown;
    };
  }
}
