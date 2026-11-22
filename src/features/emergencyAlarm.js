let audioContext
let alarmInterval
let speechInterval

export function prepareEmergencyAlarm() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  audioContext ??= new AudioContextClass()
  if (audioContext.state === 'suspended') audioContext.resume()
}

export function startEmergencyAlarm() {
  stopEmergencyAlarm()
  prepareEmergencyAlarm()

  const playTone = () => {
    if (!audioContext || audioContext.state !== 'running') return
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.48)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.5)
  }
  const speakForHelp = () => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return
    window.speechSynthesis.cancel()
    const message = new window.SpeechSynthesisUtterance('Help me. I need assistance. Please contact me.')
    message.volume = 1
    message.rate = 0.9
    window.speechSynthesis.speak(message)
  }

  playTone()
  alarmInterval = window.setInterval(playTone, 1100)
  speakForHelp()
  speechInterval = window.setInterval(speakForHelp, 9000)
}

export function stopEmergencyAlarm() {
  window.clearInterval(alarmInterval)
  window.clearInterval(speechInterval)
  alarmInterval = undefined
  speechInterval = undefined
  window.speechSynthesis?.cancel()
}
