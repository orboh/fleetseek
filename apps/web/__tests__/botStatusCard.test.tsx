/**
 * TDD: Phase 6-C
 * BotStatusCard コンポーネントのテスト
 *
 * テスト対象: src/components/voyager/BotStatusCard.tsx (未実装)
 */

import { render, screen } from '@testing-library/react';
import { BotStatusCard, BotStatusCardSkeleton } from '@/components/voyager/BotStatusCard';
import type { VoyagerBotStatus } from '@/types';

function makeBot(overrides: Partial<VoyagerBotStatus> = {}): VoyagerBotStatus {
  return {
    robot_id: 'bot-uuid-001',
    name: 'voyager_bot_1',
    alive: true,
    mc_connected: true,
    current_task: 'Mine iron ore',
    current_iteration: 7,
    skills_count: 14,
    last_heartbeat: '2026-03-17T12:34:00Z',
    last_episode: {
      id: 'ep-uuid-001',
      title: 'Voyager session abc123',
      success: true,
      created_at: '2026-03-17T12:00:00Z',
    },
    ...overrides,
  };
}

describe('BotStatusCard', () => {
  describe('alive: true', () => {
    it('ONLINE バッジが表示される', () => {
      render(<BotStatusCard bot={makeBot({ alive: true })} />);
      expect(screen.getByText('ONLINE')).toBeInTheDocument();
    });

    it('ボット名が表示される', () => {
      render(<BotStatusCard bot={makeBot({ name: 'voyager_bot_1' })} />);
      expect(screen.getByText('voyager_bot_1')).toBeInTheDocument();
    });

    it('current_task が表示される', () => {
      render(<BotStatusCard bot={makeBot({ alive: true, current_task: 'Mine iron ore' })} />);
      expect(screen.getByText('Mine iron ore')).toBeInTheDocument();
    });
  });

  describe('alive: false', () => {
    it('OFFLINE バッジが表示される', () => {
      render(<BotStatusCard bot={makeBot({ alive: false })} />);
      expect(screen.getByText('OFFLINE')).toBeInTheDocument();
    });

    it('current_task がグレーアウトして表示される', () => {
      render(<BotStatusCard bot={makeBot({ alive: false, current_task: 'Mine iron ore' })} />);
      const taskEl = screen.getByTestId('current-task');
      expect(taskEl).toHaveClass('text-muted-foreground');
    });
  });

  describe('mc_connected', () => {
    it('mc_connected: true のとき MC アイコンが接続状態になる', () => {
      render(<BotStatusCard bot={makeBot({ mc_connected: true })} />);
      // data-testid is either 'mc-status' (with data-connected attr) or 'mc-connected'
      const mcEl =
        screen.queryByTestId('mc-status') ??
        screen.queryByTestId('mc-connected') ??
        screen.getByTestId('mc-disconnected');
      expect(mcEl).toBeInTheDocument();
      if (mcEl.hasAttribute('data-connected')) {
        expect(mcEl).toHaveAttribute('data-connected', 'true');
      } else {
        expect(mcEl.getAttribute('data-testid')).toBe('mc-connected');
      }
    });

    it('mc_connected: false のとき MC アイコンが切断状態になる', () => {
      render(<BotStatusCard bot={makeBot({ mc_connected: false })} />);
      const mcEl =
        screen.queryByTestId('mc-status') ??
        screen.queryByTestId('mc-disconnected') ??
        screen.getByTestId('mc-connected');
      expect(mcEl).toBeInTheDocument();
      if (mcEl.hasAttribute('data-connected')) {
        expect(mcEl).toHaveAttribute('data-connected', 'false');
      } else {
        expect(mcEl.getAttribute('data-testid')).toBe('mc-disconnected');
      }
    });
  });

  describe('last_episode', () => {
    it('last_episode があるときエピソードタイトルが表示される', () => {
      render(
        <BotStatusCard
          bot={makeBot({
            last_episode: { id: 'ep-001', title: 'Voyager session abc123', success: true, created_at: '2026-03-17T12:00:00Z' },
          })}
        />
      );
      expect(screen.getByText('Voyager session abc123')).toBeInTheDocument();
    });

    it('last_episode: null のとき "No recent episodes" が表示される', () => {
      render(<BotStatusCard bot={makeBot({ last_episode: null })} />);
      expect(screen.getByText('No recent episodes')).toBeInTheDocument();
    });
  });
});

describe('BotStatusCardSkeleton', () => {
  it('スケルトンが表示される', () => {
    render(<BotStatusCardSkeleton />);
    expect(screen.getByTestId('bot-status-skeleton')).toBeInTheDocument();
  });
});
