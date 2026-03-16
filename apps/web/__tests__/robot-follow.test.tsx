/**
 * TDD: Step 9-1
 * useRobotFollow フックのテスト
 *
 * テスト対象: src/hooks/index.ts の useRobotFollow (未実装)
 * optimistic update と API エラー時のロールバックを検証する。
 */

import { renderHook, act } from '@testing-library/react';
import { useRobotFollow } from '@/hooks';
import { api } from '@/lib/api';

// api モック
jest.mock('@/lib/api', () => ({
  api: {
    followRobot: jest.fn(),
    unfollowRobot: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('useRobotFollow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('フォローしていない状態から toggle()', () => {
    it('optimistic update: 即座に isFollowing=true になる', async () => {
      mockedApi.followRobot.mockResolvedValue({ followed: true });

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', false, 10)
      );

      expect(result.current.isFollowing).toBe(false);
      expect(result.current.followerCount).toBe(10);

      act(() => {
        result.current.toggle();
      });

      // API 完了前に楽観的更新が反映されていること
      expect(result.current.isFollowing).toBe(true);
      expect(result.current.followerCount).toBe(11);
    });

    it('api.followRobot が正しい robotId で呼ばれる', async () => {
      mockedApi.followRobot.mockResolvedValue({ followed: true });

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', false, 10)
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockedApi.followRobot).toHaveBeenCalledWith('robot-uuid-001');
      expect(mockedApi.unfollowRobot).not.toHaveBeenCalled();
    });

    it('API エラー時は isFollowing と followerCount が元に戻る', async () => {
      mockedApi.followRobot.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', false, 10)
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isFollowing).toBe(false);
      expect(result.current.followerCount).toBe(10);
    });
  });

  describe('フォロー済みの状態から toggle()', () => {
    it('optimistic update: 即座に isFollowing=false になる', async () => {
      mockedApi.unfollowRobot.mockResolvedValue({ unfollowed: true });

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', true, 15)
      );

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isFollowing).toBe(false);
      expect(result.current.followerCount).toBe(14);
    });

    it('api.unfollowRobot が正しい robotId で呼ばれる', async () => {
      mockedApi.unfollowRobot.mockResolvedValue({ unfollowed: true });

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', true, 15)
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockedApi.unfollowRobot).toHaveBeenCalledWith('robot-uuid-001');
      expect(mockedApi.followRobot).not.toHaveBeenCalled();
    });

    it('API エラー時は isFollowing と followerCount が元に戻る', async () => {
      mockedApi.unfollowRobot.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', true, 15)
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isFollowing).toBe(true);
      expect(result.current.followerCount).toBe(15);
    });
  });

  describe('isLoading 状態', () => {
    it('toggle 中は isLoading=true になる', async () => {
      let resolveFollow!: (v: unknown) => void;
      mockedApi.followRobot.mockReturnValue(
        new Promise(resolve => { resolveFollow = resolve; })
      );

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', false, 10)
      );

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFollow({ followed: true });
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('isLoading 中は重複して toggle を呼べない', async () => {
      mockedApi.followRobot.mockResolvedValue({ followed: true });

      const { result } = renderHook(() =>
        useRobotFollow('robot-uuid-001', false, 10)
      );

      await act(async () => {
        result.current.toggle();
        result.current.toggle(); // 2回目は無視されるべき
      });

      expect(mockedApi.followRobot).toHaveBeenCalledTimes(1);
    });
  });
});
