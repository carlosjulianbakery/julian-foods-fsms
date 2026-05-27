"use client";

import { useRef, useImperativeHandle, forwardRef, useLayoutEffect } from "react";
import SignatureCanvas from "react-signature-canvas";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

interface Props {
  label?: string;
  // Called after every stroke with the current data URL, and with "" after clear.
  // Use this instead of reading the ref at submit time — Next.js dynamic() does
  // not forward refs through its wrapper, so the outer ref is always null.
  onDataUrl?: (dataUrl: string) => void;
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label = "Supervisor Signature", onDataUrl },
  ref
) {
  const sigRef = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    isEmpty:   () => sigRef.current?.isEmpty() ?? true,
    toDataURL: () => sigRef.current?.toDataURL("image/png") ?? "",
    clear:     () => sigRef.current?.clear(),
  }));

  // Set canvas pixel dimensions to match the container's actual CSS width on
  // mount (once, empty deps). Prevents the coordinate shift where signature_pad
  // records CSS-pixel touch positions against a mismatched canvas.width.
  useLayoutEffect(() => {
    if (!containerRef.current || !sigRef.current) return;
    const canvas = sigRef.current.getCanvas();
    canvas.width  = containerRef.current.offsetWidth;
    canvas.height = 160;
  }, []);

  function handleEnd() {
    onDataUrl?.(sigRef.current?.toDataURL("image/png") ?? "");
  }

  function handleClear() {
    sigRef.current?.clear();
    onDataUrl?.("");
  }

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <div
        ref={containerRef}
        className="border border-gray-300 rounded-lg overflow-hidden bg-white"
        style={{ height: 160 }}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="#1a1a1a"
          onEnd={handleEnd}
          canvasProps={{
            style: { touchAction: "none", display: "block", width: "100%", height: "100%" },
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono">
          Sign in the box above using your mouse or finger
        </p>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
