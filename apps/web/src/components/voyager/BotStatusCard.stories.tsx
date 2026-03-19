import type { Meta, StoryObj } from '@storybook/react';
import { BotStatusCard, BotStatusCardSkeleton } from './BotStatusCard';
import type { VoyagerBotStatus } from '@/types';

const baseBotOnline: VoyagerBotStatus = {
  robot_id: 'bot-uuid-001',
  name: 'voyager_bot_1',
  alive: true,
  mc_connected: true,
  current_task: 'Mine iron ore',
  current_iteration: 7,
  skills_count: 14,
  last_heartbeat: new Date(Date.now() - 30_000).toISOString(),
  last_episode: {
    id: 'ep-uuid-001',
    title: 'G1 crafts wooden pickaxe',
    success: true,
    created_at: new Date(Date.now() - 600_000).toISOString(),
  },
};

const meta: Meta<typeof BotStatusCard> = {
  title: 'Voyager/BotStatusCard',
  component: BotStatusCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BotStatusCard>;

export const Online: Story = {
  args: { bot: baseBotOnline },
};

export const Offline: Story = {
  args: {
    bot: {
      ...baseBotOnline,
      alive: false,
      mc_connected: false,
      current_task: 'Mine iron ore',
      last_heartbeat: new Date(Date.now() - 400_000).toISOString(),
    },
  },
};

export const Loading: StoryObj<typeof BotStatusCardSkeleton> = {
  render: () => (
    <div className="w-72">
      <BotStatusCardSkeleton />
    </div>
  ),
};

export const NoEpisodes: Story = {
  args: {
    bot: {
      ...baseBotOnline,
      last_episode: null,
    },
  },
};

export const McDisconnected: Story = {
  args: {
    bot: {
      ...baseBotOnline,
      mc_connected: false,
    },
  },
};
