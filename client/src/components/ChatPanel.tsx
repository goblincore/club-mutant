import React, { useRef, useState, useEffect } from 'react'
import styled from 'styled-components'
import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon'
import CloseIcon from '@mui/icons-material/Close'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

import { getColorByString } from '../util'
import { useAppDispatch, useAppSelector } from '../hooks'
import { MessageType, setFocused, setShowChat } from '../stores/ChatStore'
import { IChatMessage } from '../../../types/IOfficeState'

const Backdrop = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  height: 400px;
  width: 500px;
  max-height: 50%;
  max-width: 50%;
`

const Wrapper = styled.div`
  position: relative;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
`

const FabWrapper = styled.div`
  margin-top: auto;

  button {
    font-size: 14px;
    text-transform: lowercase !important;
    line-height: 100%;
    background-color: white !important;
  }
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

const InputWrapper = styled.form`
  box-shadow: 10px 10px 10px #00000018;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0px 0px 10px 10px;
  display: flex;
  flex-direction: row;
  color: rgba(255, 255, 255, 0.9);
  font-family: monospace;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
`

const InputTextField = styled(InputBase)`
  border-radius: 0px 0px 10px 10px;

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
  const focused = useAppSelector((state) => state.chat.focused)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game

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
    // move focus back to the game
    inputRef.current?.blur()

    const val = inputValue.trim()
    setInputValue('')
    if (val) {
      game.network.addChatMessage(val)
      game.myPlayer.updateDialogBubble(val)
    }
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
    <Backdrop>
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
            <InputWrapper onSubmit={handleSubmit}>
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
          </>
        ) : (
          <FabWrapper>
            <Fab
              color="secondary"
              aria-label="showChat"
              onClick={() => {
                dispatch(setShowChat(true))
                dispatch(setFocused(true))
              }}
            >
              Open Chat
            </Fab>
          </FabWrapper>
        )}
      </Wrapper>
    </Backdrop>
  )
}
