import type { NextConfig } from "next";

// O navegador só fala com o Next; /api/* é repassado ao servidor do agent. Assim o cookie
// de sessão fica na mesma origem da página e não é preciso liberar CORS.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const config: NextConfig = {
  transpilePackages: ["@nexo/domain"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
