import React from 'react';
import { render, screen } from '@testing-library/react';
import { BotStatusCard } from './BotStatusCard';
import type { VoyagerBotStatus } from '@/types';

const onlineBot: VoyagerBotStatus = {
  robot_id: 'robot-uuid-1',
  name: 'voyager_bot_1',
  alive: true,
  mc_connected: true,
  current_task: 'Mine iron ore',
  current_iteration: 7,
  skills_count: 14,
  last_heartbeat: '2026-03-17T12:34:00Z',
  last_episode: {
    id: 'ep-uuid-1',
    title: 'Session: Mine wood',
    success: true,
    created_at: '2026-03-17T10:00:00Z',
  },
};

const offlineBot: VoyagerBotStatus = {
  robot_id: 'robot-uuid-2',
  name: 'voyager_bot_2',
  alive: false,
  mc_connected: false,
  current_task: null,
  current_iteration: null,
  skills_count: null,
  last_heartbeat: null,
  last_episode: {
    id: 'ep-uuid-2',
    title: 'Old session',
    success: false,
    created_at: '2026-03-16T08:00:00Z',
  },
};

const noEpisodesBot: VoyagerBotStatus = {
  robot_id: 'robot-uuid-3',
  name: 'voyager_bot_3',
  alive: false,
  mc_connected: false,
  current_task: null,
  current_iteration: null,
  skills_count: null,
  last_heartbeat: null,
  last_episode: null,
};

describe('BotStatusCard', () => {
  test('shows ONLINE badge when alive: true', () => {
    render(<BotStatusCard bot={onlineBot} />);
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
  });

  test('shows OFFLINE badge when alive: false', () => {
    render(<BotStatusCard bot={offlineBot} />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  test('shows current_task when online', () => {
    render(<BotStatusCard bot={onlineBot} />);
    expect(screen.getByText('Mine iron ore')).toBeInTheDocument();
  });

  test('grays out current_task area when offline', () => {
    render(<BotStatusCard bot={offlineBot} />);
    const taskEl = screen.getByTestId('current-task');
    expect(taskEl).toHaveClass('text-muted-foreground');
  });

  test('shows MC connected icon when mc_connected: true', () => {
    render(<BotStatusCard bot={onlineBot} />);
    expect(screen.getByTestId('mc-connected')).toBeInTheDocument();
  });

  test('shows MC disconnected state when mc_connected: false', () => {
    render(<BotStatusCard bot={offlineBot} />);
    expect(screen.getByTestId('mc-disconnected')).toBeInTheDocument();
  });

  test('shows last episode title when last_episode is present', () => {
    render(<BotStatusCard bot={offlineBot} />);
    expect(screen.getByText('Old session')).toBeInTheDocument();
  });

  test('shows "No recent episodes" when last_episode is null', () => {
    render(<BotStatusCard bot={noEpisodesBot} />);
    expect(screen.getByText('No recent episodes')).toBeInTheDocument();
  });

  test('shows loading skeleton when loading prop is true', () => {
    render(<BotStatusCard loading />);
    expect(screen.getByTestId('bot-card-skeleton')).toBeInTheDocument();
  });

  test('shows bot name', () => {
    render(<BotStatusCard bot={onlineBot} />);
    expect(screen.getByText('voyager_bot_1')).toBeInTheDocument();
  });
});
