import Link from "next/link";
import { LockKeyhole } from "lucide-react";

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#D64D4D"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">

        {/* Brand header */}
        <div className="bg-white border-b border-gray-100 px-8 py-8 text-center">
          <div className="flex items-center justify-center mb-3">
            <HeartIcon className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-black font-garamond tracking-tight">
            Julian Bakery
          </h1>
          <p className="text-xs text-gray-500 font-mono mt-1">
            Food Safety Management System
          </p>
        </div>

        {/* Message */}
        <div className="px-8 py-10 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center mx-auto mb-4">
            <LockKeyhole className="w-5 h-5 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 font-garamond mb-2">
            Registration Restricted
          </h2>
          <p className="text-sm text-gray-500 font-mono leading-relaxed">
            Account registration is managed by your system administrator.
            Please contact them for access.
          </p>

          <Link href="/login" className="btn-secondary mt-6 inline-flex">
            Back to sign in
          </Link>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 font-mono">
        &copy; {new Date().getFullYear()} Julian Bakery &mdash; Internal use only
      </p>
    </div>
  );
}
