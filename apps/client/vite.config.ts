import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function origin(url: string | undefined): string | null {
  const match = url?.trim().match(/^(https?:\/\/[^/\s]+)/i);
  return match ? match[1] : null;
}

function contentSecurityPolicy(apiOrigins: string[]): string {
  const api = apiOrigins.join(" ");
  const allHttps = apiOrigins.every((o) => o.startsWith("https://"));
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`.trim(),
    `media-src 'self' blob: ${api}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(allHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const baseSecurityHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Feature-Policy":
    "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const apiOrigins = [
    ...new Set(
      [env.VITE_BACKEND_URL, env.VITE_CHAT_BACKEND_URL]
        .map(origin)
        .filter((o): o is string => Boolean(o)),
    ),
  ];

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
    // The dev server needs inline scripts for React Fast Refresh, so CSP is only enforced on preview.
    server: {
      headers: baseSecurityHeaders,
    },
    preview: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      headers: {
        ...baseSecurityHeaders,
        "Content-Security-Policy": contentSecurityPolicy(apiOrigins),
      },
    },
  };
});
