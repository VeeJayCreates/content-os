jest.mock('@content-os/storage',()=>({VideoCompositionRepository:class{},VideoMotionRepository:class{}}));
import { VideoMotionController } from './video-motion.controller';
describe('VideoMotionController',()=>{it('delegates plan generation and retrieval',async()=>{const service={prepare:jest.fn(),find:jest.fn()};const controller=new VideoMotionController(service as any);await controller.prepare('11111111-1111-4111-8111-111111111111');await controller.find('11111111-1111-4111-8111-111111111111');expect(service.prepare).toHaveBeenCalled();expect(service.find).toHaveBeenCalled();});});
