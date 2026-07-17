"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { getRandomTopic } from "@/modules/feeds/application/feeds";

export async function randomTopicAction(): Promise<never> {
  const topic = await getRandomTopic(getDatabase());
  redirect(topic.url);
}
