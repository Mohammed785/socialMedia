import { RequestHandler } from "express";
import { prisma, userSelect } from "../utils";


export const userInfo: RequestHandler = async (req, res) => {
    const {id} = req.query
    if(id){
        const user = await prisma.user.findUnique({where:{id:parseInt(id as string)},select:{...userSelect,gender:true,birthDate:true,bio:true}})
        return res.json({user})
    }
    return res.json({ user: req.user });
};

export const userSearch:RequestHandler = async (req,res)=>{
    const {search} = req.query
    let cursor = parseInt(req.query.cursor as string)
    const searchQuery: Record<string, any> = {
        cursor: undefined,
        skip: undefined,
        where: { email: { contains:search } },
    };
    if(cursor){
        searchQuery.cursor = {id:cursor}
        searchQuery.skip = 1
    }
    const users = await prisma.user.findMany({
        take:4,
        orderBy:[{id:"asc"}],
        ...searchQuery,
        select:{id:true,firstName:true,lastName:true,profileImg:true}
    })
    const last = users[users.length - 1];
    cursor = (last && users.length >= 4) ? last.id : 0;
    return res.json({result:users,cursor})
}
