import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: 'xr-spatial-tracking=(self "https://my.matterport.com")',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
