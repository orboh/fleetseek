/**
 * TDD: Step 9-1
 * NotificationItem コンポーネントのテスト
 *
 * テスト対象: src/components/notification/NotificationItem.tsx (未実装)
 * 通知の種類(upvote/comment/follow)に応じた表示テキストと
 * 既読/未読の視覚的区別を検証する。
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationItem } from '@/components/notification/NotificationItem';
import type { Notification } from '@/types';

// テスト用通知データファクトリ
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-001',
    type: 'upvote',
    refId: 'episode-001',
    refType: 'post',
    read: false,
    createdAt: '2026-03-14T10:00:00Z',
    actorName: 'g1_robot',
    actorDisplayName: 'G1 Robot',
    ...overrides,
  };
}

describe('NotificationItem', () => {
  describe('type: upvote', () => {
    it('アクター名が表示される', () => {
      render(<NotificationItem notification={makeNotification({ type: 'upvote', actorName: 'arm_bot' })} />);
      expect(screen.getByText(/arm_bot/)).toBeInTheDocument();
    });

    it('"upvoted your episode" テキストが表示される', () => {
      render(<NotificationItem notification={makeNotification({ type: 'upvote' })} />);
      expect(screen.getByText(/upvoted your episode/i)).toBeInTheDocument();
    });
  });

  describe('type: comment', () => {
    it('"commented on your episode" テキストが表示される', () => {
      render(
        <NotificationItem
          notification={makeNotification({ type: 'comment', refType: 'post' })}
        />
      );
      expect(screen.getByText(/commented on your episode/i)).toBeInTheDocument();
    });
  });

  describe('type: follow', () => {
    it('"followed you" テキストが表示される', () => {
      render(
        <NotificationItem
          notification={makeNotification({ type: 'follow', refType: 'robot' })}
        />
      );
      expect(screen.getByText(/followed you/i)).toBeInTheDocument();
    });
  });

  describe('既読/未読の表示', () => {
    it('未読通知には未読インジケータが表示される', () => {
      render(<NotificationItem notification={makeNotification({ read: false })} />);
      expect(screen.getByTestId('unread-indicator')).toBeInTheDocument();
    });

    it('既読通知には未読インジケータが表示されない', () => {
      render(<NotificationItem notification={makeNotification({ read: true })} />);
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });
  });

  describe('表示名の優先順位', () => {
    it('actorDisplayName がある場合はそちらを表示する', () => {
      render(
        <NotificationItem
          notification={makeNotification({ actorName: 'g1_robot', actorDisplayName: 'G1 Robot' })}
        />
      );
      expect(screen.getByText(/G1 Robot/)).toBeInTheDocument();
    });

    it('actorDisplayName が null の場合は actorName を表示する', () => {
      render(
        <NotificationItem
          notification={makeNotification({ actorName: 'g1_robot', actorDisplayName: null })}
        />
      );
      expect(screen.getByText(/g1_robot/)).toBeInTheDocument();
    });
  });

  describe('相対時刻', () => {
    it('createdAt の相対時刻が表示される', () => {
      render(<NotificationItem notification={makeNotification()} />);
      // 時刻文字列が何らかの形で表示されていること（"ago", "just now" 等）
      const timeEl = screen.getByRole('time');
      expect(timeEl).toBeInTheDocument();
    });
  });

  describe('onMarkRead コールバック', () => {
    it('未読通知をクリックすると onMarkRead が呼ばれる', () => {
      const onMarkRead = jest.fn();
      render(
        <NotificationItem
          notification={makeNotification({ read: false })}
          onMarkRead={onMarkRead}
        />
      );
      fireEvent.click(screen.getByRole('article'));
      expect(onMarkRead).toHaveBeenCalledWith('notif-001');
    });

    it('既読通知をクリックしても onMarkRead は呼ばれない', () => {
      const onMarkRead = jest.fn();
      render(
        <NotificationItem
          notification={makeNotification({ read: true })}
          onMarkRead={onMarkRead}
        />
      );
      fireEvent.click(screen.getByRole('article'));
      expect(onMarkRead).not.toHaveBeenCalled();
    });
  });
});
