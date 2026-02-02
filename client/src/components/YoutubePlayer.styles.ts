import styled from 'styled-components'

export const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: min(480px, calc(100vw - 32px));
  max-width: 480px;
  background: transparent;
  overflow: hidden;
  padding: 16px 16px 16px 16px;
  pointer-events: auto;
`

export const MiniBar = styled.div`
  height: 36px;
  width: 360px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

export const Marquee = styled.div`
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  position: relative;
  height: 18px;
`

export const MarqueeInner = styled.div`
  display: inline-block;
  padding-left: 100%;
  animation: dj-marquee 12s linear infinite;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-shadow: 0.3px 0.3px rgba(0, 0, 0, 0.8);

  @keyframes dj-marquee {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }
`

export const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 0;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`

export const Controls = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;
  align-items: center;

  .MuiIconButton-root {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    border-radius: 10px;
  }

  .MuiIconButton-root:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

export const RoomInfo = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`

export const EmptyVideo = styled.div`
  width: 200px;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
`

export const RoomPlaylist = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  max-height: 180px;
  overflow-y: auto;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    align-items: center;
  }

  .row.active {
    background: rgba(255, 255, 255, 0.12);
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title.marquee {
    position: relative;
    text-overflow: clip;
  }

  .titleInner {
    display: inline-block;
    padding-left: 100%;
    animation: room-track-marquee 12s linear infinite;
  }

  @keyframes room-track-marquee {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }

  .meta {
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.6);
  }

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`
