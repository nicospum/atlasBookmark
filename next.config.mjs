/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    '/api/**/*': ['./data/atlas.db', './data/topic_rules.json', './data/normalized/archive.json'],
    '/': ['./data/atlas.db', './data/topic_rules.json', './data/normalized/archive.json'],
  },
}

export default nextConfig
