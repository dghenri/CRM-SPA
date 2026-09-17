import { useNavigate } from "react-router-dom";
import MobileNav from "../../../components/MobileNav";
import { useAuth } from '../../../context/AuthContext';

import { Avatar, Button, Modal, Separator, Badge } from '@heroui/react';
import {
  DoorOpen, ChevronRight, BadgeCheck, LockKeyhole, MapPinned,
  BellRing, RectangleEllipsis, Headset, BookOpenText, Pencil,

} from 'lucide-react';

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export default function Account() {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    return (
        <div className="flex h-full flex-col pt-12 pb-20 mx-6">
            <MobileNav onBack={() => navigate(-1)} title={"Conta"} />
            <main className="flex-1 overflow-y-auto pt-14 pb-24">
                <div className="h-auto bg-overlay rounded-2xl">
                    <div
                        variant="tertiary"
                        className="flex h-30 w-full justify-between items-center bg-overlay rounded-2xl p-4"
                    >
                        <div className="flex gap-4">
                            <Badge.Anchor>
                                <Avatar className="h-20 w-20 rounded-full">
                                    {/* sem campo de avatar no schema do User ainda - por
                                        enquanto só as iniciais do nome como fallback */}
                                    <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
                                </Avatar>
                                <Badge color="accent" placement="bottom-right" size="lg" className="h-10 w-10 text-white" >
                                    <Pencil size={12}/>
                                </Badge>
                            </Badge.Anchor>
                            <div className="grid items-center">
                                <h2 className="flex justify-start font-semibold">
                                   Edite sua foto
                                </h2>
                                <span className="text-muted">{loading ? "" : user?.email}</span>
                            </div>
                        </div>
                        <div>
                            <ChevronRight />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}