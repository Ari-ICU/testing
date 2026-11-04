import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  experimental: {
    turbopackPluginRuntimeStrategy: "forceWorkerThreads" as any,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/audio/:path*",
        destination: `${backendUrl}/audio/:path*`,
      },
      {
        source: "/voices/:path*",
        destination: `${backendUrl}/voices/:path*`,
      },
    ];
  },
};

export default nextConfig;
