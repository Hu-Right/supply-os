/**
 * 新消息提示音（Web Audio API）
 *
 * 自 DigitalAssistant.tsx 上收至 feature 内部工具（「禁止组件文件内定义可复用工具函数」条款）。
 * 模块级单例 AudioContext，播放失败静默（与原版一致）。
 *
 * @module features/crm/utils/notify-sound
 */

let _audioCtx: AudioContext | null = null;

/** 播放提示音（Web Audio API） */
export function playNotifySound() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
    osc.stop(_audioCtx.currentTime + 0.3);
  } catch { /* 忽略音频错误 */
  }
}
