import { RequestHandler, Router } from "express";
import { unlinkSync } from "fs";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors";
import { prisma, resizeImage, StatusCodes, uploader, userSelect } from "../utils";

export const groupRouter = Router()


const getGroup:RequestHandler = async(req,res)=>{
    const id = parseInt(req.params.id)
    const group = await prisma.group.findUnique({where:{id},include:{creator:{select:userSelect}}})
    if(!group){
        throw new NotFoundError("Group Not Found")
    }
    return res.json({group})
}

const createGroup:RequestHandler = async(req,res)=>{
    const { name, description, isPrivate } = req.body;
    if(!req.file?.path){
        throw new BadRequestError("Please Provide Group Image")
    }
    const group = await prisma.group.create({
        data: {
            creatorId: req.user!.id,
            image: req.file.path,
            name,
            description,
            private: isPrivate === "true" ? true : false,
        },
    });
    await resizeImage(req.file.path,req.file.filename,req.file.destination)
    return res.status(StatusCodes.CREATED).json({group})
}

const editGroup:RequestHandler = async(req,res)=>{
    const id = parseInt(req.params.id);
    const queryObj:Record<string,any> = {}
    const old = await prisma.group.findUnique({where:{id}})
    if(!old){
        throw new NotFoundError("Group Not Found")
    }
    if(old.creatorId!==req.user?.id){
        throw new ForbiddenError("You Can't Edit This Group")
    }
    if(req.body.name) queryObj.name = req.body.name
    if (req.body.description) queryObj.description = req.body.description;
    if (req.body.private) queryObj.private = req.body.Private === "true" ? true : false;
    if(req.file){
        unlinkSync(old.image)
        await resizeImage(req.file.path,req.file.filename,req.file.destination)
        queryObj.image = req.file!.path
    }
    const group = await prisma.group.update({where:{id},data:{...queryObj}})
    return res.status(StatusCodes.ACCEPTED).json({group})
}

const deleteGroup:RequestHandler = async(req,res)=>{
    const id = parseInt(req.params.id);
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) {
        throw new NotFoundError("Group Not Found");
    }
    if (group.creatorId !== req.user?.id) {
        throw new ForbiddenError("You Can't Delete This Group");
    }
    await prisma.group.delete({where:{id}})
    unlinkSync(group.image)
    return res.json({group})
}


const getGroupRequests: RequestHandler = async (req, res) => {
    const id = parseInt(req.params.id);
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) {
        throw new NotFoundError("Group Not Found");
    }
    if (group.creatorId !== req.user?.id) {
        throw new ForbiddenError("You Can't View This Group Requests");
    }
    const requests = await prisma.groupRequest.findMany({
        where: { groupId: id, accepted: null },
        include: { sender: { select: userSelect } },
    });
    return res.json({ requests });
};

const acceptGroupRequest: RequestHandler = async (req, res) => {
    const groupId = parseInt(req.params.groupId),
        userId = parseInt(req.params.userId);
    const group = await prisma.group.findUnique({ where: { id:groupId } });
    if (!group) {
        throw new NotFoundError("Group Not Found");
    }
    if (group.creatorId !== req.user?.id) {
        throw new ForbiddenError("You Can't Respond To This Group Requests");
    }
    let request = await prisma.groupRequest.findUnique({where:{groupId_senderId:{
        groupId,senderId:userId
    }}})
    if(request?.accepted===true){
        return res.json({msg:"User Already A Member"})
    }
    request = await prisma.groupRequest.update({
        where: {
            groupId_senderId: {
                groupId,
                senderId: userId,
            },
        },
        data: { accepted: true, acceptTime: new Date() },
    });
    await prisma.groupMembership.create({data:{groupId,userId}})
    return res.json({ msg: "Accepted", request });
    
};


const declineGroupRequest: RequestHandler = async (req, res) => {
    const groupId = parseInt(req.params.groupId),
        userId = parseInt(req.params.userId);
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
        throw new NotFoundError("Group Not Found");
    }
    if (group.creatorId !== req.user?.id) {
        throw new ForbiddenError("You Can't Respond To This Group Requests");
    }
    const request = await prisma.groupRequest.delete({
        where: {
            groupId_senderId: {
                groupId,
                senderId: userId,
        }}
    });
    return res.json({ msg: "Request Declined", request });
};

const cancelGroupRequest: RequestHandler = async (req, res) => {
    const id = parseInt(req.params.id);
    const request = await prisma.groupRequest.findUnique({
        where: {
            groupId_senderId: {
                groupId: id,
                senderId: req.user!.id,
        }}
    });
    if (!request) {
        throw new NotFoundError("No Request Found To This Group");
    }
    if (request.senderId !== req.user?.id) {
        throw new ForbiddenError("You Can't Cancel This Request");
    }
    if (request.accepted === true) {
        throw new BadRequestError(
            "Request Already Accepted Try To Leave The The Group"
        );
    }
    await prisma.groupRequest.delete({
        where: {
            groupId_senderId: {
                groupId: id,
                senderId: req.user!.id,
        }}
    });
    return res.json({ request });
};


groupRouter.post("/create",uploader.single("image"),createGroup)
groupRouter.patch("/update/:id",uploader.single("image"),editGroup)
groupRouter.delete("/delete/:id",deleteGroup)
groupRouter.get("/:id",getGroup)


groupRouter.get("/:id/request/all", getGroupRequests);
groupRouter.patch("/:groupId/request/:userId/accept", acceptGroupRequest);
groupRouter.delete("/:groupId/request/:userId/decline",declineGroupRequest)
groupRouter.delete("/:id/request/cancel",cancelGroupRequest)

