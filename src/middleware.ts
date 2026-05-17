export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/forms/:path*",
    "/tasks/:path*",
    "/records/:path*",
    "/admin/:path*",
  ],
};
