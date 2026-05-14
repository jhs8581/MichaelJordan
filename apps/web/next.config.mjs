/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chat/types'],
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://15.164.117.143';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
