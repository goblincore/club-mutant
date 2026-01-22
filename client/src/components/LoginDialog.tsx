import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Avatar from '@mui/material/Avatar'
import ArrowRightIcon from '@mui/icons-material/ArrowRight'

import { Swiper, SwiperSlide } from 'swiper/react'
import SwiperCore from 'swiper'
import { Navigation } from 'swiper'
import 'swiper/css'
import 'swiper/css/navigation'

import Adam from '../assets/Adam_login.png'
import Ash from '../assets/Ash_login.png'
import Lucy from '../assets/Lucy_login.png'
import Nancy from '../assets/Nancy_login.png'
import { useAppSelector, useAppDispatch } from '../hooks'
import { setLoggedIn } from '../stores/UserStore'
import { setRoomJoined } from '../stores/RoomStore'
import { getAvatarString, getColorByString } from '../util'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

import { RoomType } from '../../../types/Rooms'

SwiperCore.use([Navigation])

const Wrapper = styled.form`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #222639;
  border-radius: 16px;
  padding: 36px 60px;
  box-shadow: 0px 0px 5px #0000006f;

  width: min(760px, 92vw);
  max-height: 92vh;
  overflow: auto;

  @media (max-width: 800px) {
    padding: 24px 20px;
  }
`

const Title = styled.p`
  margin: 5px;
  font-size: 20px;
  color: #c2c2c2;
  text-align: center;
`

const RoomName = styled.div`
  max-width: 500px;
  max-height: 120px;
  overflow-wrap: anywhere;
  overflow-y: auto;
  display: flex;
  gap: 10px;
  justify-content: center;

  h3 {
    font-size: 24px;
    color: #eee;
  }
`

const RoomDescription = styled.div`
  max-width: 500px;
  max-height: 150px;
  overflow-wrap: anywhere;
  overflow-y: auto;
  font-size: 16px;
  color: #c2c2c2;
  display: flex;
  justify-content: center;
`

const SubTitle = styled.h3`
  width: 160px;
  font-size: 16px;
  color: #eee;
  text-align: center;
`

const Content = styled.div`
  display: flex;
  margin: 36px 0;

  @media (max-width: 800px) {
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
`

const Left = styled.div`
  margin-right: 48px;

  --swiper-navigation-size: 24px;

  .swiper-container,
  .swiper {
    width: 160px;
    height: 220px;
    border-radius: 8px;
    overflow: hidden;
  }

  @media (max-width: 800px) {
    margin-right: 0;
  }

  .swiper-slide {
    width: 160px;
    height: 220px;
    background: #dbdbe0;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .swiper-slide img {
    display: block;
    width: 95px;
    height: 136px;
    object-fit: contain;
  }
`

const Right = styled.div`
  width: 300px;

  @media (max-width: 800px) {
    width: 100%;
    max-width: 360px;
  }
`

const Bottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

const avatars = [
  { name: 'adam', img: Adam },
  { name: 'ash', img: Ash },
  { name: 'lucy', img: Lucy },
  { name: 'nancy', img: Nancy },
]

// shuffle the avatars array
for (let i = avatars.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[avatars[i], avatars[j]] = [avatars[j], avatars[i]]
}

export default function LoginDialog() {
  const [name, setName] = useState<string>('')
  const [avatarIndex, setAvatarIndex] = useState<number>(0)
  const [nameFieldEmpty, setNameFieldEmpty] = useState<boolean>(false)
  const dispatch = useAppDispatch()
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const roomType = useAppSelector((state) => state.room.roomType)
  const roomName = useAppSelector((state) => state.room.roomName)
  const roomDescription = useAppSelector((state) => state.room.roomDescription)
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const game = phaserGame.scene.keys.game as Game

  const hasAutoJoinedPublic = useRef(false)

  useEffect(() => {
    if (hasAutoJoinedPublic.current) return
    if (!roomJoined) return
    if (roomType !== RoomType.PUBLIC) return
    if (!sessionId) return
    if (!game?.myPlayer) return

    hasAutoJoinedPublic.current = true

    const generatedName = `mutant-${sessionId}`

    game.myPlayer.setPlayerTexture('adam')
    game.myPlayer.setPlayerName(generatedName)
    game.network.readyToConnect()
    dispatch(setLoggedIn(true))
  }, [dispatch, game, roomJoined, roomType, sessionId])

  if (roomJoined && roomType === RoomType.PUBLIC) {
    return <></>
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name === '') {
      setNameFieldEmpty(true)
    } else if (roomJoined) {
      console.log('Join! Name:', name, 'Avatar:', avatars[avatarIndex].name)
      game.myPlayer.setPlayerName(name)
      game.myPlayer.setPlayerTexture(avatars[avatarIndex].name)
      game.network.readyToConnect()
      dispatch(setLoggedIn(true))
    }
  }

  const handleExit = () => {
    game.scene.stop()
    dispatch(setRoomJoined(false))
    console.log('////handleClickExitButton')
  }

  return (
    <Wrapper onSubmit={handleSubmit}>
      <Title>Joining</Title>
      <RoomName>
        <Avatar style={{ background: getColorByString(roomName) }}>
          {getAvatarString(roomName)}
        </Avatar>
        <h3>{roomName}</h3>
      </RoomName>
      <RoomDescription>
        <ArrowRightIcon /> {roomDescription}
      </RoomDescription>
      <Content>
        <Left>
          <SubTitle>Select an avatar</SubTitle>
          <Swiper
            navigation
            spaceBetween={0}
            slidesPerView={1}
            onSlideChange={(swiper) => {
              setAvatarIndex(swiper.activeIndex)
            }}
          >
            {avatars.map((avatar) => (
              <SwiperSlide key={avatar.name}>
                <img src={avatar.img} alt={avatar.name} />
              </SwiperSlide>
            ))}
          </Swiper>
        </Left>
        <Right>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            variant="outlined"
            color="secondary"
            error={nameFieldEmpty}
            helperText={nameFieldEmpty && 'Name is required'}
            onChange={(e) => {
              setName((e.target as HTMLInputElement).value)
              if (nameFieldEmpty) setNameFieldEmpty(false)
            }}
          />
        </Right>
      </Content>
      <Bottom>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          type="submit"
          style={{ margin: '0 10px' }}
        >
          Join
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          size="large"
          type="button"
          style={{ margin: '0 10px' }}
          onClick={() => handleExit()}
        >
          Exit
        </Button>
      </Bottom>
    </Wrapper>
  )
}
