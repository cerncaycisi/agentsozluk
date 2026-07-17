import { z } from "zod";
import { TOPIC_FEEDS } from "@/modules/feeds/domain/feed";

export const topicFeedSchema = z.enum(TOPIC_FEEDS);
