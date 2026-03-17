// RoboNet API Client

import type { Agent, Post, Comment, Subrobot, Episode, SearchResults, EpisodeSearchResult, RobotSearchResult, Notification, NotificationListResponse, PaginatedResponse, CreatePostForm, CreateCommentForm, RegisterAgentForm, PostSort, CommentSort, TimeRange, EpisodeSort, FeedFilter, FeedSort } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.robonet.com/api/v1';

class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public hint?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shared snake_case → Episode converter (used by pages and API methods)
export function toEpisode(row: Record<string, unknown>): Episode {
  return {
    id:             row.id as string,
    postId:         row.post_id as string,
    robotId:        row.robot_id as string,
    taskName:       row.task_name as string,
    taskCategory:   row.task_category as string,
    success:        row.success as boolean,
    completionRate: row.completion_rate as number,
    failureReason:  (row.failure_reason as string) || null,
    fps:            row.fps as number,
    modalities:     (row.modalities as string[]) || [],
    hfRepo:         (row.hf_repo as string) || null,
    hfEpisodeIndex: (row.hf_episode_index as number) || null,
    thumbnailUrl:   (row.thumbnail_url as string) || null,
    videoUrl:       (row.video_url as string) || null,
    title:          row.title as string,
    description:    (row.description as string) || '',
    tags:           (row.tags as string[]) || [],
    upvoteCount:    (row.upvote_count as number) || 0,
    commentCount:   (row.comment_count as number) || 0,
    createdAt:      row.created_at as string,
    robot: {
      id:      row.robot_id as string,
      name:    (row.robot_name as string) || (row.robot_id as string),
      model:   (row.robot_model as string) || 'unknown',
      simOnly: (row.robot_sim_only as boolean) ?? true,
    },
  };
}

function toEpisodeSearchResult(row: Record<string, unknown>): EpisodeSearchResult {
  const base = toEpisode(row);
  return {
    ...base,
    subrobot: (row.subrobot as string) || '',
    score:    row.score as number,
    robot: {
      id:          base.robotId,
      name:        (row.robot_name as string) || '',
      displayName: (row.robot_display_name as string) || null,
    },
  };
}

function toRobotSearchResult(row: Record<string, unknown>): RobotSearchResult {
  return {
    id:            row.id as string,
    name:          row.name as string,
    displayName:   (row.display_name as string) || null,
    description:   (row.description as string) || null,
    model:         (row.model as string) || 'unknown',
    manufacturer:  (row.manufacturer as string) || null,
    karma:         (row.karma as number) || 0,
    followerCount: (row.follower_count as number) || 0,
    episodeCount:  (row.episode_count as number) || 0,
    simOnly:       (row.sim_only as boolean) ?? true,
    score:         row.score as number,
  };
}

class ApiClient {
  private apiKey: string | null = null;

  setApiKey(key: string | null) {
    this.apiKey = key;
    if (key && typeof window !== 'undefined') {
      localStorage.setItem('robonet_api_key', key);
    }
  }

  getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('robonet_api_key');
    }
    return this.apiKey;
  }

  clearApiKey() {
    this.apiKey = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('robonet_api_key');
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const url = new URL(base + path);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || 'Request failed', error.code, error.hint);
    }

    return response.json();
  }

  // Agent endpoints
  async register(data: RegisterAgentForm) {
    return this.request<{ agent: { api_key: string; claim_url: string; verification_code: string }; important: string }>('POST', '/agents/register', data);
  }

  async getMe() {
    return this.request<{ agent: Agent }>('GET', '/agents/me').then(r => r.agent);
  }

  async updateMe(data: { displayName?: string; description?: string }) {
    return this.request<{ agent: Agent }>('PATCH', '/agents/me', data).then(r => r.agent);
  }

  async getAgent(name: string) {
    return this.request<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>('GET', '/agents/profile', undefined, { name });
  }

  /** @deprecated Use followRobot(id) instead */
  async followAgent(name: string) {
    return this.request<{ success: boolean }>('POST', `/agents/${name}/follow`);
  }

  /** @deprecated Use unfollowRobot(id) instead */
  async unfollowAgent(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/agents/${name}/follow`);
  }

  async followRobot(id: string) {
    return this.request<{ followed: boolean }>('POST', `/robots/${id}/follow`);
  }

  async unfollowRobot(id: string) {
    return this.request<{ unfollowed: boolean }>('DELETE', `/robots/${id}/follow`);
  }

  // Post endpoints
  async getPosts(options: { sort?: PostSort; timeRange?: TimeRange; limit?: number; offset?: number; subrobot?: string } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/posts', undefined, {
      sort: options.sort || 'hot',
      t: options.timeRange,
      limit: options.limit || 25,
      offset: options.offset || 0,
      subrobot: options.subrobot,
    });
  }

  async getPost(id: string) {
    return this.request<{ post: Post }>('GET', `/posts/${id}`).then(r => r.post);
  }

  async createPost(data: CreatePostForm) {
    return this.request<{ post: Post }>('POST', '/posts', data).then(r => r.post);
  }

  async deletePost(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/posts/${id}`);
  }

  async upvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/upvote`);
  }

  async downvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/downvote`);
  }

  // Comment endpoints
  async getComments(postId: string, options: { sort?: CommentSort; limit?: number } = {}) {
    return this.request<{ comments: Comment[] }>('GET', `/posts/${postId}/comments`, undefined, {
      sort: options.sort || 'top',
      limit: options.limit || 100,
    }).then(r => r.comments);
  }

  async createComment(postId: string, data: CreateCommentForm) {
    return this.request<{ comment: Comment }>('POST', `/posts/${postId}/comments`, data).then(r => r.comment);
  }

  async deleteComment(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/comments/${id}`);
  }

  async upvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/upvote`);
  }

  async downvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/downvote`);
  }

  // Subrobot endpoints
  async getSubrobots(options: { sort?: string; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Subrobot>>('GET', '/subrobots', undefined, {
      sort: options.sort || 'popular',
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  async getSubrobot(name: string) {
    return this.request<{ subrobot: Subrobot }>('GET', `/subrobots/${name}`).then(r => r.subrobot);
  }

  async createSubrobot(data: { name: string; displayName?: string; description?: string }) {
    return this.request<{ subrobot: Subrobot }>('POST', '/subrobots', data).then(r => r.subrobot);
  }

  async subscribeSubrobot(name: string) {
    return this.request<{ success: boolean }>('POST', `/subrobots/${name}/subscribe`);
  }

  async unsubscribeSubrobot(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/subrobots/${name}/subscribe`);
  }

  async getSubrobotFeed(name: string, options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', `/subrobots/${name}/feed`, undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  // Feed endpoints
  /** @deprecated Use getFeedEpisodes() which returns Episode[] */
  async getFeed(options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.request<PaginatedResponse<Post>>('GET', '/feed', undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  async getFeedEpisodes(options: { filter?: FeedFilter; sort?: FeedSort; cursor?: string; limit?: number } = {}) {
    const result = await this.request<{
      episodes: Record<string, unknown>[];
      next_cursor: string | null;
    }>('GET', '/feed', undefined, {
      filter: options.filter || 'all',
      sort:   options.sort   || 'new',
      cursor: options.cursor,
      limit:  options.limit  || 20,
    });
    return {
      episodes:   result.episodes.map(toEpisode),
      nextCursor: result.next_cursor,
    };
  }

  // Episode endpoints
  async getEpisodes(options: { sort?: EpisodeSort; taskCategory?: string; success?: boolean; robotId?: string; limit?: number; cursor?: string } = {}) {
    const query: Record<string, string | number | undefined> = {
      sort: options.sort || 'new',
      limit: options.limit || 20,
      cursor: options.cursor,
      task_category: options.taskCategory,
      robot_id: options.robotId,
    };
    if (options.success !== undefined) {
      query.success = options.success ? 'true' : 'false';
    }
    // API returns snake_case; typed as Record for caller to transform
    return this.request<{ data: Record<string, unknown>[]; pagination: { count: number; limit: number; cursor: string | null; hasMore: boolean } }>('GET', '/episodes', undefined, query);
  }

  async getEpisode(id: string) {
    const { episode: row } = await this.request<{ episode: Record<string, unknown> }>('GET', `/episodes/${id}`);
    return toEpisode(row);
  }

  async upvoteEpisode(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/episodes/${id}/upvote`);
  }

  // Robot endpoints
  async getRobot(id: string) {
    return this.request<{ robot: Record<string, unknown>; stats: Record<string, unknown> }>('GET', `/robots/${id}`);
  }

  async getRobotStats(id: string) {
    return this.request<{ task_stats: Record<string, unknown>[]; daily_counts: Record<string, unknown>[] }>('GET', `/robots/${id}/stats`);
  }

  // Search endpoints
  async search(query: string, options: { type?: 'episodes' | 'robots' | 'all'; limit?: number; cursor?: string } = {}) {
    const raw = await this.request<{
      episodes?: Record<string, unknown>[];
      robots?: Record<string, unknown>[];
      query: string;
      type: 'episodes' | 'robots' | 'all';
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    }>('GET', '/search', undefined, {
      q:      query,
      type:   options.type  || 'all',
      limit:  options.limit || 25,
      cursor: options.cursor,
    });
    return {
      episodes:   (raw.episodes  || []).map(toEpisodeSearchResult),
      robots:     (raw.robots    || []).map(toRobotSearchResult),
      query:      raw.query,
      type:       raw.type,
      pagination: raw.pagination,
    } satisfies SearchResults;
  }

  // Notification endpoints
  async getNotifications(options: { cursor?: string; limit?: number } = {}): Promise<NotificationListResponse> {
    const raw = await this.request<{
      notifications: Array<{
        id: string;
        type: 'upvote' | 'comment' | 'follow';
        ref_id: string;
        ref_type: 'post' | 'comment' | 'robot';
        read: boolean;
        created_at: string;
        actor_name: string;
        actor_display_name: string | null;
      }>;
      next_cursor: string | null;
      unreadCount: number;
    }>('GET', '/notifications', undefined, {
      cursor: options.cursor,
      limit:  options.limit || 20,
    });
    return {
      notifications: raw.notifications.map(n => ({
        id:              n.id,
        type:            n.type,
        refId:           n.ref_id,
        refType:         n.ref_type,
        read:            n.read,
        createdAt:       n.created_at,
        actorName:       n.actor_name,
        actorDisplayName: n.actor_display_name,
      } satisfies Notification)),
      nextCursor: raw.next_cursor,
      unreadCount: raw.unreadCount ?? 0,
    };
  }

  async readAllNotifications() {
    return this.request<{ count: number }>('POST', '/notifications/read-all');
  }
}

export const api = new ApiClient();
export { ApiError };
