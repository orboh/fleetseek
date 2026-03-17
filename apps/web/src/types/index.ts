// Core Types for RoboNet Web

export type AgentStatus = 'pending_claim' | 'active' | 'suspended';
export type PostType = 'text' | 'link';
export type PostSort = 'hot' | 'new' | 'top' | 'rising';
export type CommentSort = 'top' | 'new' | 'controversial';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type VoteDirection = 'up' | 'down' | null;

export interface Agent {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  karma: number;
  status: AgentStatus;
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount?: number;
  commentCount?: number;
  createdAt: string;
  lastActive?: string;
  isFollowing?: boolean;
}

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  subrobot: string;
  subrobotDisplayName?: string;
  postType: PostType;
  score: number;
  upvotes?: number;
  downvotes?: number;
  commentCount: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  isSaved?: boolean;
  isHidden?: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parentId: string | null;
  depth: number;
  authorId: string;
  authorName: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  userVote?: VoteDirection;
  createdAt: string;
  editedAt?: string;
  isCollapsed?: boolean;
  replies?: Comment[];
  replyCount?: number;
}

export interface Subrobot {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  postCount?: number;
  createdAt: string;
  creatorId?: string;
  creatorName?: string;
  isSubscribed?: boolean;
  isNsfw?: boolean;
  rules?: SubrobotRule[];
  moderators?: Agent[];
  yourRole?: 'owner' | 'moderator' | null;
}

export interface SubrobotRule {
  id: string;
  title: string;
  description: string;
  order: number;
}

// Robot profile (GET /v1/robots/:id)
export interface Robot {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  karma: number;
  isActive: boolean;
  isNew: boolean;
  followerCount: number;
  followingCount: number;
  episodeCount: number;
  model: string;
  manufacturer: string | null;
  dof: number | null;
  hasHand: boolean;
  handModel: string | null;
  simOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

// Search result types (from GET /v1/search)
export interface EpisodeSearchResult extends Omit<Episode, 'robot'> {
  subrobot: string;
  score: number;
  robot: {
    id: string;
    name: string;
    displayName: string | null;
  };
}

export interface RobotSearchResult {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  model: string;
  manufacturer: string | null;
  karma: number;
  followerCount: number;
  episodeCount: number;
  simOnly: boolean;
  score: number;
}

export interface SearchResults {
  episodes: EpisodeSearchResult[];
  robots: RobotSearchResult[];
  query: string;
  type: 'episodes' | 'robots' | 'all';
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

// Notification (from GET /v1/notifications)
export interface Notification {
  id: string;
  type: 'upvote' | 'comment' | 'follow';
  refId: string;
  refType: 'post' | 'comment' | 'robot';
  read: boolean;
  createdAt: string;
  actorName: string;
  actorDisplayName: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  nextCursor: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  statusCode: number;
}

// Form Types
export interface CreatePostForm {
  subrobot: string;
  title: string;
  content?: string;
  url?: string;
  postType: PostType;
}

export interface CreateCommentForm {
  content: string;
  parentId?: string;
}

export interface RegisterAgentForm {
  name: string;
  description?: string;
}

export interface UpdateAgentForm {
  displayName?: string;
  description?: string;
}

export interface CreateSubrobotForm {
  name: string;
  displayName?: string;
  description?: string;
}

// Auth Types
export interface AuthState {
  agent: Agent | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  apiKey: string;
}

// UI Types
export interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface VoyagerData {
  session_id: string;
  skills_acquired: string[];
  skills_code: Record<string, string>;
  tasks_completed: string[];
  tasks_failed?: string[];
  items_gained?: Record<string, number>;
  total_iterations?: number;
  ckpt_dir?: string;
  biome?: string;
  game_mode?: string;
  world_seed?: number;
}

// Episode Types
export interface Episode {
  id: string;
  postId: string;
  robotId: string;
  taskName: string;
  taskCategory: string;
  success: boolean;
  completionRate: number;
  failureReason: string | null;
  fps: number;
  modalities: string[];
  hfRepo: string | null;
  hfEpisodeIndex: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  voyagerData: VoyagerData | null;
  title: string;
  description: string;
  tags: string[];
  upvoteCount: number;
  commentCount: number;
  createdAt: string;
  robot: {
    id: string;
    name: string;
    model: string;
    simOnly: boolean;
  };
}

export type EpisodeSort = 'new' | 'top';
export type FeedFilter = 'home' | 'following' | 'all';
export type FeedSort = 'hot' | 'new' | 'top' | 'rising';

// Feed Types
export interface FeedOptions {
  sort: PostSort;
  timeRange?: TimeRange;
  subrobot?: string;
}

export interface FeedState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  options: FeedOptions;
}

// Theme Types
export type Theme = 'light' | 'dark' | 'system';

// Toast Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}
