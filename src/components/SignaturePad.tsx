"use client";

import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

interface Props {
  label?: string;
}

const CANVAS_HEIGHT = 160;

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label = "Supervisor Signature" },
  ref
) {
  const sigRef       = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Measure the container so the canvas has correct pixel dimensions.
  // Without this, the canvas defaults to 300×150 px internally while
  // being displayed at a much larger CSS size — touch coordinates fall
  // outside the internal canvas bounds and react-signature-canvas stores
  // nothing, so isEmpty() returns true even after signing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (w: number) => setWidth(Math.floor(w));

    // Set initial size
    update(el.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    isEmpty:  () => sigRef.current?.isEmpty() ?? true,
    toDataURL:() => sigRef.current?.toDataURL("image/png") ?? "",
    clear:    () => sigRef.current?.clear(),
  }));

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <div
        ref={containerRef}
        className="border border-gray-300 rounded-lg overflow-hidden bg-white"
        style={{ height: CANVAS_HEIGHT }}
      >
        {/* Only render the canvas once we know the real pixel width */}
        {width > 0 && (
          <SignatureCanvas
            ref={sigRef}
            penColor="#1a1a1a"
            canvasProps={{
              width,
              height: CANVAS_HEIGHT,
              // Prevent the browser from treating finger strokes as scroll
              // gestures — critical for tablet use.
              style: { touchAction: "none", display: "block" },
            }}
          />
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono">
          Sign in the box above using your mouse or finger
        </p>
        <button
          type="button"
          onClick={() => sigRef.current?.clear()}
          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
