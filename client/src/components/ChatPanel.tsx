import React, { useRef, useState, useEffect } from 'react'
import styled from 'styled-components'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

import { getColorByString } from '../util'
import { useAppDispatch, useAppSelector } from '../hooks'
import { MessageType, setFocused, setShowChat } from '../stores/ChatStore'
import { IChatMessage } from '../../../types/IOfficeState'

const Backdrop = styled.div<{ $expanded: boolean }>`
  position: fixed;
  bottom: 0;
  left: 0;
  height: ${(p) => (p.$expanded ? '400px' : '64px')};
  width: 500px;
  max-height: 50%;
  max-width: 50%;
  pointer-events: auto;
`

const Wrapper = styled.div`
  position: relative;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
`

const ChatHeader = styled.div`
  position: relative;
  height: 35px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-bottom: none;
  border-radius: 10px 10px 0px 0px;
  backdrop-filter: blur(8px);

  h3 {
    color: rgba(255, 255, 255, 0.9);
    margin: 7px;
    font-size: 17px;
    text-align: center;
  }

  .close {
    position: absolute;
    top: 0;
    right: 0;
  }
`

const ChatBox = styled(Box)`
  height: 100%;
  width: 100%;
  overflow: auto;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);

  p,
  span {
    color: rgba(255, 255, 255, 0.9) !important;
  }
`

const MessageWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  padding: 0px 2px;

  p {
    margin: 3px;
    text-shadow: 0.3px 0.3px rgba(0, 0, 0, 0.8);
    font-size: 15px;
    font-weight: bold;
    color: green;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  span {
    color: rgba(255, 255, 255, 0.9);
    font-weight: normal;
  }

  .notification {
    color: rgba(255, 255, 255, 0.6);
    font-weight: normal;
  }

  :hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

const InputWrapper = styled.form<{ $focused?: boolean }>`
  box-shadow: ${(p) =>
    p.$focused
      ? '0 0 8px 2px rgba(255, 255, 255, 0.8), 0 0 20px 6px rgba(200, 230, 255, 0.5), 0 0 40px 12px rgba(255, 255, 255, 0.2), 10px 10px 10px #00000018'
      : '10px 10px 10px #00000018'};
  border: 1px solid
    ${(p) => (p.$focused ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.25)')};
  border-radius: 10px;
  display: flex;
  flex-direction: row;
  color: rgba(255, 255, 255, 0.9);
  font-family: monospace;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  transition:
    box-shadow 0.15s ease-out,
    border-color 0.15s ease-out;
  animation: ${(p) => (p.$focused ? 'plasma-pulse 2s ease-in-out infinite' : 'none')};

  @keyframes plasma-pulse {
    0%,
    100% {
      box-shadow:
        0 0 8px 2px rgba(255, 255, 255, 0.8),
        0 0 20px 6px rgba(200, 230, 255, 0.5),
        0 0 40px 12px rgba(255, 255, 255, 0.2),
        10px 10px 10px #00000018;
    }
    50% {
      box-shadow:
        0 0 12px 3px rgba(255, 255, 255, 0.95),
        0 0 30px 10px rgba(220, 240, 255, 0.7),
        0 0 60px 20px rgba(255, 255, 255, 0.35),
        10px 10px 10px #00000018;
    }
  }
`

const InputTextField = styled(InputBase)`
  border-radius: 10px;

  input {
    padding: 5px;
    color: rgba(255, 255, 255, 0.9);
    font-family: monospace;
  }
`

const EmojiPickerWrapper = styled.div`
  position: absolute;
  bottom: 54px;
  right: 16px;
`

const dateFormatter = new Intl.DateTimeFormat('en', {
  timeStyle: 'short',
  dateStyle: 'short',
})

type EmojiSelectResult = {
  native?: string
}

type MessageProps = {
  chatMessage: IChatMessage
  messageType: MessageType
}

const Message: React.FC<MessageProps> = ({ chatMessage, messageType }) => {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  return (
    <MessageWrapper
      onMouseEnter={() => {
        setTooltipOpen(true)
      }}
      onMouseLeave={() => {
        setTooltipOpen(false)
      }}
    >
      <Tooltip
        open={tooltipOpen}
        title={dateFormatter.format(chatMessage.createdAt)}
        placement="right"
        arrow
      >
        {messageType === MessageType.REGULAR_MESSAGE ? (
          <p
            style={{
              color: getColorByString(chatMessage.author),
            }}
          >
            {chatMessage.author}: <span>{chatMessage.content}</span>
          </p>
        ) : (
          <p className="notification">
            {chatMessage.author} {chatMessage.content}
          </p>
        )}
      </Tooltip>
    </MessageWrapper>
  )
}

export default function Chat() {
  const [inputValue, setInputValue] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatMessages = useAppSelector((state) => state.chat.chatMessages)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const focused = useAppSelector((state) => state.chat.focused)
  const currentDjSessionId = useAppSelector((state) => state.musicStream.currentDj.sessionId)
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const mySessionId = useAppSelector((state) => state.user.sessionId)
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      if (focused) return

      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable)

      if (isTypingTarget) return

      dispatch(setFocused(true))
      window.setTimeout(() => {
        inputRef.current?.focus()
      }, 0)

      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
    }
  }, [dispatch, focused])

  const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
    setInputValue(event.currentTarget.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // move focus back to the game
      inputRef.current?.blur()
      dispatch(setShowChat(false))
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const val = inputValue.trim()
    setInputValue('')
    if (val) {
      game.network.addChatMessage(val)
      const isDj =
        connectedBoothIndex !== null ||
        (currentDjSessionId !== null && mySessionId !== null && currentDjSessionId === mySessionId)
      game.myPlayer.updateDialogBubble(val, isDj ? 1.5 : 1)
    }

    dispatch(setFocused(true))
    window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (focused) {
      inputRef.current?.focus()
    }
  }, [focused])

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, showChat])

  return (
    <Backdrop $expanded={showChat}>
      <Wrapper>
        {showChat ? (
          <>
            <ChatHeader>
              <h3>Chat</h3>
              <IconButton
                aria-label="close dialog"
                className="close"
                onClick={() => dispatch(setShowChat(false))}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </ChatHeader>
            <ChatBox>
              {chatMessages.map(({ messageType, chatMessage }, index) => (
                <Message chatMessage={chatMessage} messageType={messageType} key={index} />
              ))}
              <div ref={messagesEndRef} />
              {showEmojiPicker && (
                <EmojiPickerWrapper>
                  <Picker
                    data={data}
                    theme="dark"
                    previewPosition="none"
                    skinTonePosition="none"
                    onEmojiSelect={(emoji: EmojiSelectResult) => {
                      if (!emoji.native) return

                      setInputValue(inputValue + emoji.native)
                      setShowEmojiPicker(!showEmojiPicker)
                      dispatch(setFocused(true))
                    }}
                  />
                </EmojiPickerWrapper>
              )}
            </ChatBox>
          </>
        ) : null}

        <InputWrapper
          onSubmit={handleSubmit}
          $focused={focused}
          style={{ borderRadius: showChat ? '0px 0px 10px 10px' : '10px' }}
        >
          <IconButton
            aria-label="toggle chat history"
            onClick={() => dispatch(setShowChat(!showChat))}
            size="small"
          >
            <ChatBubbleOutlineIcon />
          </IconButton>
          <InputTextField
            inputRef={inputRef}
            autoFocus={focused}
            fullWidth
            placeholder="Press Enter to chat"
            value={inputValue}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
            onFocus={() => {
              if (!focused) dispatch(setFocused(true))
            }}
            onBlur={() => dispatch(setFocused(false))}
          />
          <IconButton aria-label="emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
            <InsertEmoticonIcon />
          </IconButton>
        </InputWrapper>
      </Wrapper>
    </Backdrop>
  )
}
