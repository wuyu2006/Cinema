// AudioWorklet 的 inputs 反映浏览器真正交付的解码声道。不能把 AudioNode.channelCount 当成媒体元数据。
class ChannelProbe extends AudioWorkletProcessor {
  constructor(){super();this.frames=0;this.channels=-1;this.energy=0;}
  process(inputs){
    const channels=inputs[0]||[];let power=0;
    for(const data of channels)for(let i=0;i<data.length;i+=8)power+=data[i]*data[i];
    this.frames+=128;this.energy=Math.max(this.energy,Math.sqrt(power/Math.max(1,channels.length*16)));
    if(channels.length!==this.channels || this.frames>sampleRate*.25){
      this.channels=channels.length;this.port.postMessage({channels:this.channels,level:this.energy});this.frames=0;this.energy=0;
    }
    // 探针只输出静音，电影声音通过独立的矩阵路由，防止信号被重复播放。
    return true;
  }
}
registerProcessor('cinema-channel-probe',ChannelProbe);
