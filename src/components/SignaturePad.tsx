"use client";

import { useRef, useImperativeHandle, forwardRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

interface Props {
  label?: string;
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ label = "Supervisor Signature" }, ref) {
  const sigRef = useRef<SignatureCanvas>(null);

  useImperativeHandle(ref, () => ({
    isEmpty: () => sigRef.current?.isEmpty() ?? true,
    toDataURL: () => sigRef.current?.toDataURL("image/png") ?? "",
    clear: () => sigRef.current?.clear(),
  }));

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white" style={{ height: 160 }}>
        <SignatureCanvas
          ref={sigRef}
          penColor="#1a1a1a"
          canvasProps={{ style: { width: "100%", height: "100%" } }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono">Sign in the box above using your mouse or finger</p>
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
