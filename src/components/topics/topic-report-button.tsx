import { GammazButton } from "@/components/moderation/gammaz-button";

export function TopicReportButton({ topicId }: { topicId: string }) {
  return <GammazButton targetType="TOPIC" targetId={topicId} />;
}
