import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdfjs-dist must not be bundled into the server chunks.
   *
   * It loads its own worker at run time, and when the bundler inlines the
   * library that load resolves next to the generated chunk rather than next to
   * the package, so `/api/profile/piq` fails with:
   *
   *   Setting up fake worker failed: "Cannot find module
   *   '.next/dev/server/chunks/pdf.worker.mjs' imported from
   *   '.next/dev/server/chunks/node_modules_pdfjs-dist_legacy_build_pdf_mjs_….js'"
   *
   * Opting the package out leaves it in node_modules and loaded through Node's
   * own resolver, which finds the worker beside it. This entry was added only
   * after reproducing that failure — it is not precautionary.
   */
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
