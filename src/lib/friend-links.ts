export interface FriendLink {
  name: string;
  url: string;
  description: string;
  avatar?: string;
}

// 在这里追加友链即可，页面会自动渲染。
// 头像建议下载到 public/friend-avatars/ 下引用，避免外链头像在部分网络不可用。
export const friendLinks: FriendLink[] = [
  {
    name: "梓瑶",
    url: "https://blog.ziyao.cc/",
    description: "Linux、RISC-V 与汇编的系统笔记，间或业余无线电与年终随笔。",
    avatar: "/friend-avatars/ziyao.jpg",
  },
];
