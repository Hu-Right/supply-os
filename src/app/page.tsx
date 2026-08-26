/**
 * Phase 1 临时首页
 * Phase 3 将替换为 redirect("/showroom")
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold text-primary-600">
        Supply OS — Next.js 迁移进行中
      </h1>
      <p className="text-secondary-800">
        Next.js 骨架已就绪（Phase 1）。原有站点运行于{" "}
        <a
          href="http://localhost:3039/"
          className="text-primary-600 underline"
        >
          localhost:3039
        </a>
        。
      </p>
    </main>
  );
}
