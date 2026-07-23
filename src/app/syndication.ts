import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { xmlResponse } from "@/lib/http/xml";
import { parseTopicRouteReference, topicPublicUrl } from "@/lib/routing/public-urls";
import { getSyndicationEntries } from "@/modules/indexing";
import { publicProfileUrl } from "@/modules/indexing/domain/public-seo";
import {
  buildAtomFeed,
  buildRssFeed,
  profileSyndicationFeed,
  siteSyndicationFeed,
  topicSyndicationFeed,
  type SyndicationFeed,
} from "@/modules/indexing/domain/syndication";
import { getTopic, getTopicByPublicId } from "@/modules/topics/application/topics";
import { getPublicProfile } from "@/modules/users/application/profiles";

export type SyndicationFormat = "rss" | "atom";

function mediaType(format: SyndicationFormat): "application/rss+xml" | "application/atom+xml" {
  return format === "rss" ? "application/rss+xml" : "application/atom+xml";
}

function fileName(format: SyndicationFormat): "feed.xml" | "atom.xml" {
  return format === "rss" ? "feed.xml" : "atom.xml";
}

function feedResponse(format: SyndicationFormat, feed: SyndicationFeed): Response {
  const baseUrl = getEnvironment().APP_URL;
  const body = format === "rss" ? buildRssFeed(baseUrl, feed) : buildAtomFeed(baseUrl, feed);
  return xmlResponse(body, 200, mediaType(format));
}

function notFoundResponse(format: SyndicationFormat): Response {
  return xmlResponse("<error>Bulunamadı</error>", 404, mediaType(format));
}

function redirectResponse(path: string): Response {
  return Response.redirect(new URL(path, getEnvironment().APP_URL), 308);
}

export async function siteFeedResponse(format: SyndicationFormat): Promise<Response> {
  const generatedAt = new Date();
  const entries = await getSyndicationEntries(getDatabase(), { now: generatedAt });
  return feedResponse(format, siteSyndicationFeed(entries, generatedAt));
}

export async function topicFeedResponse(
  format: SyndicationFormat,
  segment: string,
): Promise<Response> {
  const reference = parseTopicRouteReference(segment);
  if (!reference) return notFoundResponse(format);

  let topic;
  try {
    topic =
      reference.kind === "public"
        ? await getTopicByPublicId(getDatabase(), reference.publicId, null)
        : await getTopic(getDatabase(), reference.id, null);
  } catch (error) {
    if (error instanceof AppError && error.code === "TOPIC_MERGED") {
      const canonical = error.details?.canonicalTopic;
      if (
        canonical &&
        typeof canonical === "object" &&
        "url" in canonical &&
        typeof canonical.url === "string"
      ) {
        return redirectResponse(`${canonical.url}/${fileName(format)}`);
      }
    }
    if (error instanceof AppError && error.code === "TOPIC_NOT_FOUND")
      return notFoundResponse(format);
    throw error;
  }

  const canonicalPath = topicPublicUrl(topic);
  if (reference.kind === "legacy" || segment !== `${topic.slug}--${topic.publicId}`)
    return redirectResponse(`${canonicalPath}/${fileName(format)}`);

  const generatedAt = new Date();
  const entries = await getSyndicationEntries(getDatabase(), {
    now: generatedAt,
    topicId: topic.id,
  });
  return feedResponse(format, topicSyndicationFeed(topic, entries, generatedAt));
}

export async function profileFeedResponse(
  format: SyndicationFormat,
  username: string,
): Promise<Response> {
  let result;
  try {
    result = await getPublicProfile(getDatabase(), { username, skip: 0, take: 1 });
  } catch (error) {
    if (error instanceof AppError && error.code === "USER_NOT_FOUND")
      return notFoundResponse(format);
    throw error;
  }

  const profile = result.profile;
  const canonicalPath = publicProfileUrl(profile.username);
  if (username !== profile.username)
    return redirectResponse(`${canonicalPath}/${fileName(format)}`);

  const generatedAt = new Date();
  const entries = await getSyndicationEntries(getDatabase(), {
    now: generatedAt,
    authorId: profile.id,
  });
  return feedResponse(format, profileSyndicationFeed(profile, entries, generatedAt));
}
