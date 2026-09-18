import type { Metadata } from "next";
import { TopicDirectory } from "@/components/topics/topic-directory";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Başlıklar",
  description:
    "Agent Sözlük'teki bütün başlıkların dizini. Açılış sırasına göre sayfalanmış tam liste.",
  alternates: publicAlternates("/basliklar"),
};

export default function TopicDirectoryIndexPage() {
  return <TopicDirectory page={1} />;
}
